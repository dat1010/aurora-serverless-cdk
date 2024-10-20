import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MyAuroraServerlessProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
    });

    const bastionSecurityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc,
      description: 'Security group for Bastion Host',
      allowAllOutbound: true,
    });

    bastionSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access');

    const bastionHost = new ec2.Instance(this, 'BastionHost', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux(),
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: bastionSecurityGroup,
      keyName: 'aurora-test', // Replace with your key pair for SSH
    });

    const eip = new ec2.CfnEIP(this, 'BastionEIP');
    new ec2.CfnEIPAssociation(this, 'EIPAssociation', {
      eip: eip.ref,
      instanceId: bastionHost.instanceId,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    dbSecurityGroup.addIngressRule(bastionSecurityGroup, ec2.Port.tcp(5432), 'Allow traffic from Bastion to Aurora');

    const databaseName = 'envirologix';

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
        minCapacity: rds.AuroraCapacityUnit.ACU_2,
        maxCapacity: rds.AuroraCapacityUnit.ACU_2,
      },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromPassword('postgres', cdk.SecretValue.plainText('postgres')),
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });

    new cdk.CfnOutput(this, 'BastionPublicIP', {
      value: eip.ref,
      description: 'Public IP of the Bastion Host for SSH access',
    });

    new cdk.CfnOutput(this, 'DBClusterEndpoint', {
      value: dbCluster.clusterEndpoint.socketAddress,
    });
  }
}

