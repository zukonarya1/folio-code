import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './environment-config';

export interface PdfConversationFrontendStackProps extends cdk.StackProps {
  readonly domainName?: string;
  readonly ssmEnvName?: string;
  readonly envConfig?: EnvironmentConfig;
}

export class PdfConversationFrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly siteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: PdfConversationFrontendStackProps) {
    super(scope, id, props);

    const p = props?.envConfig?.prefix ?? '';

    this.siteBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${p}pdf-conversation-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'FrontendOAC', {
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE,
    });

    this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      ...(props?.domainName && props?.ssmEnvName ? {
        domainNames: [props.domainName],
        certificate: acm.Certificate.fromCertificateArn(
          this,
          'ImportedCert',
          ssm.StringParameter.valueForStringParameter(this, `/pdfconv/${props.ssmEnvName}/cert-arn`)
        ),
      } : {}),
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    if (props?.ssmEnvName && props?.domainName) {
      const importedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'ImportedZone', {
        hostedZoneId: ssm.StringParameter.valueForStringParameter(this, `/pdfconv/${props.ssmEnvName}/hosted-zone-id`),
        zoneName: props.domainName,
      });
      new route53.ARecord(this, 'CloudFrontAliasRecord', {
        zone: importedZone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
    }

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.siteBucket.bucketName,
      description: 'S3 bucket hosting the React frontend assets',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for cache invalidation',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront domain name for accessing the frontend',
    });
  }
}