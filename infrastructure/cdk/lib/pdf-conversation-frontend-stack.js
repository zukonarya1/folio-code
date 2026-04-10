"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfConversationFrontendStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
class PdfConversationFrontendStack extends cdk.Stack {
    distribution;
    siteBucket;
    constructor(scope, id, props) {
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
                certificate: acm.Certificate.fromCertificateArn(this, 'ImportedCert', ssm.StringParameter.valueForStringParameter(this, `/pdfconv/${props.ssmEnvName}/cert-arn`)),
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
exports.PdfConversationFrontendStack = PdfConversationFrontendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1mcm9udGVuZC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBkZi1jb252ZXJzYXRpb24tZnJvbnRlbmQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLHVFQUF5RDtBQUN6RCw0RUFBOEQ7QUFDOUQsaUVBQW1EO0FBQ25ELHdFQUEwRDtBQUMxRCx5REFBMkM7QUFDM0MseUVBQTJEO0FBVTNELE1BQWEsNEJBQTZCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekMsWUFBWSxDQUEwQjtJQUN0QyxVQUFVLENBQVk7SUFFdEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF5QztRQUNqRixLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLENBQUMsR0FBRyxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sSUFBSSxFQUFFLENBQUM7UUFFekMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3RELFVBQVUsRUFBRSxHQUFHLENBQUMsNkJBQTZCLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDM0QsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsTUFBTSxHQUFHLEdBQUcsSUFBSSxVQUFVLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNwRSxPQUFPLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUI7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFB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Qy9DLFdBQVcsRUFBRSxtREFBbUQ7U0FDakUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBakZELG9FQWlGQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBQZGZDb252ZXJzYXRpb25Gcm9udGVuZFN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IGRvbWFpbk5hbWU/OiBzdHJpbmc7XG4gIHJlYWRvbmx5IHNzbUVudk5hbWU/OiBzdHJpbmc7XG4gIHJlYWRvbmx5IGVudkNvbmZpZz86IEVudmlyb25tZW50Q29uZmlnO1xufVxuXG5leHBvcnQgY2xhc3MgUGRmQ29udmVyc2F0aW9uRnJvbnRlbmRTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBkaXN0cmlidXRpb246IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgc2l0ZUJ1Y2tldDogczMuQnVja2V0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogUGRmQ29udmVyc2F0aW9uRnJvbnRlbmRTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBwID0gcHJvcHM/LmVudkNvbmZpZz8ucHJlZml4ID8/ICcnO1xuXG4gICAgdGhpcy5zaXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnRnJvbnRlbmRCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtwfXBkZi1jb252ZXJzYXRpb24tZnJvbnRlbmQtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBvYWMgPSBuZXcgY2xvdWRmcm9udC5TM09yaWdpbkFjY2Vzc0NvbnRyb2wodGhpcywgJ0Zyb250ZW5kT0FDJywge1xuICAgICAgc2lnbmluZzogY2xvdWRmcm9udC5TaWduaW5nLlNJR1Y0X05PX09WRVJSSURFLFxuICAgIH0pO1xuXG4gICAgdGhpcy5kaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Zyb250ZW5kRGlzdHJpYnV0aW9uJywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbCh0aGlzLnNpdGVCdWNrZXQsIHtcbiAgICAgICAgICBvcmlnaW5BY2Nlc3NDb250cm9sOiBvYWMsXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXG4gICAgICAuLi4ocHJvcHM/LmRvbWFpbk5hbWUgJiYgcHJvcHM/LnNzbUVudk5hbWUgPyB7XG4gICAgICAgIGRvbWFpbk5hbWVzOiBbcHJvcHMuZG9tYWluTmFtZV0sXG4gICAgICAgIGNlcnRpZmljYXRlOiBhY20uQ2VydGlmaWNhdGUuZnJvbUNlcnRpZmljYXRlQXJuKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgJ0ltcG9ydGVkQ2VydCcsXG4gICAgICAgICAgc3NtLlN0cmluZ1BhcmFtZXRlci52YWx1ZUZvclN0cmluZ1BhcmFtZXRlcih0aGlzLCBgL3BkZmNvbnYvJHtwcm9wcy5zc21FbnZOYW1lfS9jZXJ0LWFybmApXG4gICAgICAgICksXG4gICAgICB9IDoge30pLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIGlmIChwcm9wcz8uc3NtRW52TmFtZSAmJiBwcm9wcz8uZG9tYWluTmFtZSkge1xuICAgICAgY29uc3QgaW1wb3J0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyh0aGlzLCAnSW1wb3J0ZWRab25lJywge1xuICAgICAgICBob3N0ZWRab25lSWQ6IHNzbS5TdHJpbmdQYXJhbWV0ZXIudmFsdWVGb3JTdHJpbmdQYXJhbWV0ZXIodGhpcywgYC9wZGZjb252LyR7cHJvcHMuc3NtRW52TmFtZX0vaG9zdGVkLXpvbmUtaWRgKSxcbiAgICAgICAgem9uZU5hbWU6IHByb3BzLmRvbWFpbk5hbWUsXG4gICAgICB9KTtcbiAgICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ0Nsb3VkRnJvbnRBbGlhc1JlY29yZCcsIHtcbiAgICAgICAgem9uZTogaW1wb3J0ZWRab25lLFxuICAgICAgICByZWNvcmROYW1lOiBwcm9wcy5kb21haW5OYW1lLFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhuZXcgdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KHRoaXMuZGlzdHJpYnV0aW9uKSksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRnJvbnRlbmRCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuc2l0ZUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgaG9zdGluZyB0aGUgUmVhY3QgZnJvbnRlbmQgYXNzZXRzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250RGlzdHJpYnV0aW9uSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIElEIGZvciBjYWNoZSBpbnZhbGlkYXRpb24nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnREb21haW5OYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgZG9tYWluIG5hbWUgZm9yIGFjY2Vzc2luZyB0aGUgZnJvbnRlbmQnLFxuICAgIH0pO1xuICB9XG59Il19