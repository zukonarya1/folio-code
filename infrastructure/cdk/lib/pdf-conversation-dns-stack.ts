import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface PdfConversationDnsStackProps extends cdk.StackProps {
  readonly domainName: string;
  readonly envName: string;
}

export class PdfConversationDnsStack extends cdk.Stack {
  public readonly hostedZone: route53.PublicHostedZone;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: PdfConversationDnsStackProps) {
    super(scope, id, props);

    this.hostedZone = new route53.PublicHostedZone(this, 'SubdomainHostedZone', {
      zoneName: props.domainName,
    });

    this.certificate = new acm.Certificate(this, 'SubdomainCertificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    new cr.AwsCustomResource(this, 'CertArnSsmWriter', {
      onCreate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: `/pdfconv/${props.envName}/cert-arn`,
          Value: this.certificate.certificateArn,
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-west-2',
        physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/cert-arn`),
      },
      onUpdate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: `/pdfconv/${props.envName}/cert-arn`,
          Value: this.certificate.certificateArn,
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-west-2',
        physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/cert-arn`),
      },
      onDelete: {
        service: 'SSM',
        action: 'deleteParameter',
        parameters: { Name: `/pdfconv/${props.envName}/cert-arn` },
        region: 'us-west-2',
        ignoreErrorCodesMatching: 'ParameterNotFound',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
          resources: [
            `arn:aws:ssm:us-west-2:${this.account}:parameter/pdfconv/${props.envName}/cert-arn`,
          ],
        }),
      ]),
    });

    new cr.AwsCustomResource(this, 'ZoneIdSsmWriter', {
      onCreate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: `/pdfconv/${props.envName}/hosted-zone-id`,
          Value: this.hostedZone.hostedZoneId,
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-west-2',
        physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/hosted-zone-id`),
      },
      onUpdate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: `/pdfconv/${props.envName}/hosted-zone-id`,
          Value: this.hostedZone.hostedZoneId,
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-west-2',
        physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/hosted-zone-id`),
      },
      onDelete: {
        service: 'SSM',
        action: 'deleteParameter',
        parameters: { Name: `/pdfconv/${props.envName}/hosted-zone-id` },
        region: 'us-west-2',
        ignoreErrorCodesMatching: 'ParameterNotFound',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
          resources: [
            `arn:aws:ssm:us-west-2:${this.account}:parameter/pdfconv/${props.envName}/hosted-zone-id`,
          ],
        }),
      ]),
    });

    new cdk.CfnOutput(this, 'SubdomainHostedZoneId', {
      value: this.hostedZone.hostedZoneId,
    });

    new cdk.CfnOutput(this, 'SubdomainNameServers', {
      value: cdk.Fn.join(',', this.hostedZone.hostedZoneNameServers!),
    });

    new cdk.CfnOutput(this, 'AcmCertificateArn', {
      value: this.certificate.certificateArn,
    });
  }
}
