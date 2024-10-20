import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MyAuroraServerlessProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC with public subnets
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2, // Use 2 availability zones
      natGateways: 1, // Ensures public subnets are created with NAT gateway
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC, // Public subnet to allow internet access
        },
        {
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT, // Private subnet for internal resources
        },
      ],
    });

    // Security Group for the EC2 Bastion Host (allowing SSH from anywhere)
    const bastionSecurityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc,
      description: 'Security group for Bastion Host',
      allowAllOutbound: true, // Allow outbound traffic to Aurora
    });

    // Allow SSH (port 22) from any IP (you can restrict this to your IP range)
    bastionSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access');

    // Create an EC2 instance (bastion host) in the public subnet
    const bastionHost = new ec2.Instance(this, 'BastionHost', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), // t3.micro for free tier
      machineImage: ec2.MachineImage.latestAmazonLinux(), // Amazon Linux AMI
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // Place in public subnet
      securityGroup: bastionSecurityGroup,
      keyName: 'aurora-test', // Replace with your key pair for SSH
    });

    // Allocate an Elastic IP and associate it with the bastion host for public access
    const eip = new ec2.CfnEIP(this, 'BastionEIP');
    new ec2.CfnEIPAssociation(this, 'EIPAssociation', {
      eip: eip.ref,
      instanceId: bastionHost.instanceId,
    });

    // Security Group for the Aurora Serverless Cluster
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    // Allow incoming traffic from the Bastion Host to PostgreSQL port 5432
    dbSecurityGroup.addIngressRule(bastionSecurityGroup, ec2.Port.tcp(5432), 'Allow traffic from Bastion to Aurora');

    const databaseName = 'envirologix';

    // Create the Aurora Serverless cluster
    const dbCluster = new rds.ServerlessCluster(this, 'PortalAuroraProd', {
      vpc,
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      enableDataApi: true,
      defaultDatabaseName: databaseName,
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(
        this,
        'ParameterGroup',
        'default.aurora-postgresql13',
      ),
      scaling: {
        minCapacity: rds.AuroraCapacityUnit.ACU_2, // Minimum ACUs
        maxCapacity: rds.AuroraCapacityUnit.ACU_2, // Maximum ACUs
      },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromPassword('postgres', cdk.SecretValue.plainText('postgres')), // Set user and password
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }, // Place Aurora in private subnet
    });

    // Output the Bastion Host's public IP for easy access
    new cdk.CfnOutput(this, 'BastionPublicIP', {
      value: eip.ref,
      description: 'Public IP of the Bastion Host for SSH access',
    });

    // Output the Aurora Cluster endpoint
    new cdk.CfnOutput(this, 'DBClusterEndpoint', {
      value: dbCluster.clusterEndpoint.socketAddress,
    });
  }
}

