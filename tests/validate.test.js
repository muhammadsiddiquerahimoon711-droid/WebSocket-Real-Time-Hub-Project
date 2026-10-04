const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateUsername, validateRoom, validateText } = require('../src/validate');
const { createLimiter } = require('../src/rateLimiter');

describe('input validation', () => {
  test('username rules', () => {
    assert.equal(validateUsername('Ali Khan').ok, true);
    assert.equal(validateUsername('a').ok, false);
    assert.equal(validateUsername('x'.repeat(31)).ok, false);
    assert.equal(validateUsername('<script>').ok, false);
    assert.equal(validateUsername(undefined).ok, false);
  });
  test('room rules', () => {
    assert.equal(validateRoom('general').ok, true);
    assert.equal(validateRoom('dev-team_1').ok, true);
    assert.equal(validateRoom('').ok, false);
    assert.equal(validateRoom('bad room!').ok, false);
    assert.equal(validateRoom('r'.repeat(51)).ok, false);
  });
  test('message text rules', () => {
    assert.equal(validateText('hello').ok, true);
    assert.equal(validateText('   ').ok, false);
    assert.equal(validateText('x'.repeat(1001)).ok, false);
    assert.equal(validateText('  hi  ').value, 'hi');
  });
});

describe('rate limiter', () => {
  test('blocks after max events and recovers after the window', () => {
    let t = 0;
    const l = createLimiter(3, 1000, () => t);
    assert.ok(l.allow() && l.allow() && l.allow());
    assert.equal(l.allow(), false);
    t = 1500;
    assert.equal(l.allow(), true);
  });
});
