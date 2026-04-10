export type EnvironmentName = 'dev' | 'staging' | 'prod';

export interface EnvironmentConfig {
  name: EnvironmentName;
  prefix: string;
  accountId: string;
  region: string;
  domainName?: string;
  deletionPolicy: 'RETAIN' | 'DESTROY';
  allowedCorsOrigins: string[];
  userPoolId: string;
}

export function buildEnvironmentConfig(name: EnvironmentName): EnvironmentConfig {
  const base = {
    accountId: '874962954560',
    region: 'us-west-2',
  };

  switch (name) {
    case 'prod':
      return {
        ...base,
        name: 'prod',
        prefix: '',
        domainName: 'folio.zukonarya.com',
        deletionPolicy: 'RETAIN',
        allowedCorsOrigins: [
          'http://localhost:3000',
          'https://d20i1jxkq2rcuo.cloudfront.net',
          'https://folio.zukonarya.com',
        ],
        userPoolId: 'us-west-2_dU8CUUTew',
      };
    case 'staging':
      return {
        ...base,
        name: 'staging',
        prefix: 'staging-',
        deletionPolicy: 'RETAIN',
        allowedCorsOrigins: ['http://localhost:3000'],
        userPoolId: 'us-west-2_C7ybOyeoW',
      };
    case 'dev':
      return {
        ...base,
        name: 'dev',
        prefix: 'dev-',
        deletionPolicy: 'DESTROY',
        allowedCorsOrigins: [
          'http://localhost:3000',
          'https://d1zt32z8u8ijf3.cloudfront.net',
        ],
        userPoolId: 'us-west-2_5mBfueXlz',
      };
  }
}
