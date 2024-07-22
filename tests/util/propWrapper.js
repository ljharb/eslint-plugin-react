'use strict';

const assert = require('assert');
const {
  getPropWrapperFunctions,
  isPropWrapperFunction,
  getExactPropWrapperFunctions,
  isExactPropWrapperFunction,
  formatPropWrapperFunctions,
} = require('../../lib/util/propWrapper');

describe('PropWrapperFunctions', () => {
  describe('getPropWrapperFunctions', () => {
    it('returns set of functions if setting exists', () => {
      const propWrapperFunctions = [
        'Object.freeze',
        {
          property: 'forbidExtraProps',
        },
      ];
      const context = {
        settings: {
          propWrapperFunctions,
        },
      };
      assert.deepStrictEqual(getPropWrapperFunctions(context), new Set(propWrapperFunctions));
    });

    it('returns empty set if no setting', () => {
      const context = {
        settings: {},
      };
      assert.deepStrictEqual(getPropWrapperFunctions(context), new Set([]));
    });
  });

  describe('isPropWrapperFunction', () => {
    it('with string', () => {
      const context = {
        settings: {
          propWrapperFunctions: ['Object.freeze'],
        },
      };
      assert.equal(isPropWrapperFunction(context, 'Object.freeze'), true);
    });

    it('with Object with object and property keys', () => {
      const context = {
        settings: {
          propWrapperFunctions: [
            {
              property: 'freeze',
              object: 'Object',
            },
          ],
        },
      };
      assert.equal(isPropWrapperFunction(context, 'Object.freeze'), true);
    });

    it('with Object with only property key', () => {
      const context = {
        settings: {
          propWrapperFunctions: [
            {
              property: 'forbidExtraProps',
            },
          ],
        },
      };
      assert.equal(isPropWrapperFunction(context, 'forbidExtraProps'), true);
    });
  });

  describe('getExactPropWrapperFunctions', () => {
    it('returns set of functions if setting exists', () => {
      const propWrapperFunctions = [
        'Object.freeze',
        {
          property: 'forbidExtraProps',
          exact: true,
        },
      ];
      const context = {
        settings: {
          propWrapperFunctions,
        },
      };
      assert.deepStrictEqual(getExactPropWrapperFunctions(context), new Set([{
        property: 'forbidExtraProps',
        exact: true,
      }]));
    });

    it('returns empty set if no exact prop wrappers', () => {
      const propWrapperFunctions = [
        'Object.freeze',
        {
          property: 'forbidExtraProps',
        },
      ];
      const context = {
        settings: {
          propWrapperFunctions,
        },
      };
      assert.deepStrictEqual(getExactPropWrapperFunctions(context), new Set([]));
    });

    it('returns empty set if no setting', () => {
      const context = {
        settings: {},
      };
      assert.deepStrictEqual(getExactPropWrapperFunctions(context), new Set([]));
    });
  });

  describe('isExactPropWrapperFunction', () => {
    it('with string', () => {
      const context = {
        settings: {
          propWrapperFunctions: ['Object.freeze'],
        },
      };
      assert.equal(isExactPropWrapperFunction(context, 'Object.freeze'), false);
    });

    it('with Object with object and property keys', () => {
      const context = {
        settings: {
          propWrapperFunctions: [
            {
              property: 'freeze',
              object: 'Object',
              exact: true,
            },
          ],
        },
      };
      assert.equal(isExactPropWrapperFunction(context, 'Object.freeze'), true);
    });

    it('with Object with only property key', () => {
      const context = {
        settings: {
          propWrapperFunctions: [
            {
              property: 'forbidExtraProps',
              exact: true,
            },
          ],
        },
      };
      assert.equal(isExactPropWrapperFunction(context, 'forbidExtraProps'), true);
    });
  });

  describe('formatPropWrapperFunctions', () => {
    it('with empty set', () => {
      const propWrappers = new Set([]);
      assert.equal(formatPropWrapperFunctions(propWrappers), '');
    });

    it('with all allowed values', () => {
      const propWrappers = new Set([
        'Object.freeze',
        {
          property: 'exact',
          exact: true,
        },
        {
          property: 'bar',
          object: 'foo',
        },
      ]);
      assert.equal(formatPropWrapperFunctions(propWrappers), '\'Object.freeze\', \'exact\', \'foo.bar\'');
    });
  });
});
