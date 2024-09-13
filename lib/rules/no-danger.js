/**
 * @fileoverview Prevent usage of dangerous JSX props
 * @author Scott Andrews
 */

'use strict';

const minimatch = require('minimatch');

const docsUrl = require('../util/docsUrl');
const { isDOMComponent } = require('../util/jsx');
const report = require('../util/report');

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

/** @type {['dangerouslySetInnerHTML']} */
const DANGEROUS_PROPERTY_NAMES = [
  'dangerouslySetInnerHTML',
];

/** @typedef {typeof DANGEROUS_PROPERTY_NAMES[number]} DangerousPropertyName */

const DANGEROUS_PROPERTIES = /** @type {Record<DangerousPropertyName, [DangerousPropertyName, DangerousPropertyName]>} */ (
  /** @type {unknown} */ (
    Object.fromEntries(DANGEROUS_PROPERTY_NAMES.map((prop) => [prop, prop]))
  )
);

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Checks if a JSX attribute is dangerous.
 * @type {(name: string | JSXIdentifier) => name is DangerousPropertyName}
 */
function isDangerous(name) {
  return typeof name === 'string' && Object.hasOwn(DANGEROUS_PROPERTIES, name);
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  dangerousProp: 'Dangerous property \'{{name}}\' found',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow usage of dangerous JSX properties',
      category: 'Best Practices',
      recommended: false,
      url: docsUrl('no-danger'),
    },

    messages,

    schema: [{
      type: 'object',
      properties: {
        customComponentNames: {
          items: {
            type: 'string',
          },
          minItems: 0,
          type: 'array',
          uniqueItems: true,
        },
      },
    }],
  },

  create(context) {
    const configuration = context.options[0] || {};
    /** @type {string[]} */
    const customComponentNames = configuration.customComponentNames || [];

    return {
      /** @param {JSXAttribute} node */
      JSXAttribute(node) {
        const functionName = 'name' in node.parent
          && typeof node.parent.name === 'object'
          && 'name' in node.parent.name
          ? node.parent.name.name
          : `${node.parent.name.object.name}.${node.parent.name.property.name}`;

        const enableCheckingCustomComponent = customComponentNames.some((name) => minimatch(functionName, name));

        if ((enableCheckingCustomComponent || isDOMComponent(node.parent)) && isDangerous(node.name.name)) {
          report(context, messages.dangerousProp, 'dangerousProp', {
            node,
            data: {
              name: node.name.name,
            },
          });
        }
      },
    };
  },
};
