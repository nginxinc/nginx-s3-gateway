# Testing


## Integration Tests

### Troubleshooting Integration Tests

#### `AggregateError` doesn't tell me what went wrong
Wrap the "expect" statements of the offending test in a `try/catch` block and print the error like so:
```javascript
try {
  expect(foo).toEqual(bar);
} catch (e) {
  console.log("Aggregate Error: ", e);
}
```

TODO: Maybe write a custom reporter

#### I want to know what request the container actually received
There are two options here:
1. In the `afterAll` block, comment out the code that runs the container teardown. After the test fails, you can run `docker logs -f nginx-s3-gateway-test-base`

2. Before the code that is erroring, add `timeout(3000)` then quickly run `docker logs -f nginx-s3-gateway-test-base` in another tab after the container starts.