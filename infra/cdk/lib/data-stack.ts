import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface DataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecret: secretsmanager.Secret;
}

export class SpeclynDataStack extends cdk.Stack {
  public readonly rdsEndpoint: string;
  public readonly rdsPort: string;
  public readonly redisEndpoint: string;
  public readonly redisPort: string;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // ── RDS PostgreSQL ──────────────────────────────────────────────────────
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'speclyn-db-sg', {
      vpc: props.vpc,
      securityGroupName: 'speclyn-db-sg',
      description: 'Speclyn RDS PostgreSQL',
      allowAllOutbound: false,
    });

    const dbInstance = new rds.DatabaseInstance(this, 'speclyn-postgres', {
      instanceIdentifier: 'speclyn-postgres',
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(props.dbSecret),
      databaseName: 'speclyn',
      multiAz: false, // single AZ for cost — switch to true for prod
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enablePerformanceInsights: true,
      monitoringInterval: cdk.Duration.seconds(60),
    });

    this.rdsEndpoint = dbInstance.dbInstanceEndpointAddress;
    this.rdsPort = dbInstance.dbInstanceEndpointPort;

    // ── ElastiCache Redis ───────────────────────────────────────────────────
    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'speclyn-redis-sg', {
      vpc: props.vpc,
      securityGroupName: 'speclyn-redis-sg',
      description: 'Speclyn ElastiCache Redis',
      allowAllOutbound: false,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'speclyn-redis-subnets', {
      cacheSubnetGroupName: 'speclyn-redis-subnets',
      description: 'Speclyn Redis subnet group',
      subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
    });

    const redisCluster = new elasticache.CfnReplicationGroup(this, 'speclyn-redis', {
      replicationGroupDescription: 'Speclyn Redis cluster',
      replicationGroupId: 'speclyn-redis',
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: 'cache.t4g.micro',
      numCacheClusters: 1, // single node for cost — increase for HA
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName!,
      securityGroupIds: [this.redisSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: false, // ioredis default — enable if needed
      automaticFailoverEnabled: false,
      port: 6379,
    });
    redisCluster.addDependency(redisSubnetGroup);

    this.redisEndpoint = redisCluster.attrPrimaryEndPointAddress;
    this.redisPort = redisCluster.attrPrimaryEndPointPort;

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'RdsEndpoint', { value: this.rdsEndpoint });
    new cdk.CfnOutput(this, 'RedisEndpoint', { value: this.redisEndpoint });
  }
}
