import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class SpeclynSecretsStack extends cdk.Stack {
  public readonly dbSecret: secretsmanager.Secret;
  public readonly appSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Database credentials — auto-generated password
    this.dbSecret = new secretsmanager.Secret(this, 'speclyn-db-secret', {
      secretName: 'speclyn/database',
      description: 'Speclyn PostgreSQL credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'speclyn',
          dbname: 'speclyn',
        }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // Application secrets — manually populated via console or CLI
    // Contains: CLERK_SECRET_KEY, ENCRYPTION_KEY, GITHUB_PRIVATE_KEY, etc.
    this.appSecret = new secretsmanager.Secret(this, 'speclyn-app-secret', {
      secretName: 'speclyn/app',
      description: 'Speclyn application secrets (Clerk, encryption key, GitHub, Bitbucket, etc.)',
      secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
        CLERK_SECRET_KEY: 'REPLACE_ME',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'REPLACE_ME',
        ENCRYPTION_KEY: 'REPLACE_ME',
        GITHUB_APP_ID: '',
        GITHUB_PRIVATE_KEY: '',
        BITBUCKET_CLIENT_ID: '',
        BITBUCKET_CLIENT_SECRET: '',
        RESEND_API_KEY: '',
      })),
    });

    // Outputs
    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecret.secretArn });
    new cdk.CfnOutput(this, 'AppSecretArn', { value: this.appSecret.secretArn });
  }
}
