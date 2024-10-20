import * as cdk from 'aws-cdk-lib';

import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

export class MyAuroraServerlessProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2 // Default is all AZs in the region
    });


    const databaseName = 'envirologix';
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,

      allowAllOutbound: true,
    });

    // Allow incoming traffic from any IP on PostgreSQL port 5432
    dbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432));


    const dbCluster = new rds.ServerlessCluster(this, 'PortalAuroraProd', {
      vpc,
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,

      enableDataApi: true,

      defaultDatabaseName: databaseName,
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(
        this,
        'ParameterGroup',

        'default.aurora-postgresql13'

      ),
      scaling: {
        minCapacity: rds.AuroraCapacityUnit.ACU_2, // default is 2 ACUs
        maxCapacity: rds.AuroraCapacityUnit.ACU_2, // default is 16 ACUs
      },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromPassword('postgres', cdk.SecretValue.plainText('postgres')), // Set user and password
    });

    // Optional: Output the cluster endpoint
    new cdk.CfnOutput(this, 'DBClusterEndpoint', {
      value: dbCluster.clusterEndpoint.socketAddress,
    });
  }

}
