#!/usr/bin/env node
const { App, Stack } = require('aws-cdk-lib');

const app = new App();

class TestStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    console.log('TestStack created successfully!');
  }
}

new TestStack(app, 'TestStack', {
  env: { account: '198945929229', region: 'us-west-2' }
});

console.log('App created with stacks:', app.node.children.map(child => child.node.id));