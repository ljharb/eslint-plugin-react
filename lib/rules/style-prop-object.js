/**
 * @fileoverview Enforce style prop value is an object
 * @author David Petersen
 */

'use strict';

const { getVariableFromContext } = require('../util/variable');
const docsUrl = require('../util/docsUrl');
const isCreateElement = require('../util/isCreateElement');
const report = require('../util/report');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  stylePropNotObject: 'Style prop value must be an object',
};

/** @param {ASTNode} expression An Identifier node */
function isNonNullaryLiteral(expression) {
  return expression.type === 'Literal' && 'value' in expression && expression.value !== null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Enforce style prop value is an object',
      category: 'Possible Errors',
      recommended: false,
      url: docsUrl('style-prop-object'),
    },

    messages,

    schema: [
      {
        type: 'object',
        properties: {
          allow: {
            type: 'array',
            items: {
              type: 'string',
            },
            additionalItems: false,
            uniqueItems: true,
          },
        },
      },
    ],
  },

  create(context) {
    const allowed = new Set(((context.options.length > 0) && context.options[0].allow) || []);

    /** @param {Identifier} node An Identifier node */
    function checkIdentifiers(node) {
      const variable = getVariableFromContext(context, node, node.name);

      if (!variable || !variable.defs[0] || !variable.defs[0].node.init) {
        return;
      }

      if (isNonNullaryLiteral(variable.defs[0].node.init)) {
        report(context, messages.stylePropNotObject, 'stylePropNotObject', {
          node,
        });
      }
    }

    return {
      CallExpression(node) {
        if (
          isCreateElement(context, node)
          && node.arguments.length > 1
        ) {
          if ('name' in node.arguments[0] && node.arguments[0].name) {
            // store name of component
            const componentName = node.arguments[0].name;

            // allowed list contains the name
            if (allowed.has(componentName)) {
              // abort operation
              return;
            }
          }
          if (node.arguments[1].type === 'ObjectExpression') {
            const style = node.arguments[1].properties.find((property) => (
              'key' in property
              && property.key
              && 'name' in property.key
              && property.key.name === 'style'
              && !property.computed
            ));

            if (style && 'value' in style) {
              if (style.value.type === 'Identifier') {
                checkIdentifiers(style.value);
              } else if (isNonNullaryLiteral(style.value)) {
                report(context, messages.stylePropNotObject, 'stylePropNotObject', {
                  node: style.value,
                });
              }
            }
          }
        }
      },

      /** @param {JSXAttribute} node */
      JSXAttribute(node) {
        if (!node.value || node.name.name !== 'style') {
          return;
        }
        // store parent element
        const { parent, value } = node;

        // parent element is a JSXOpeningElement
        if (parent && parent.type === 'JSXOpeningElement') {
          // get the name of the JSX element
          const name = parent.name && 'name' in parent.name && parent.name.name;

          // allowed list contains the name
          if (allowed.has(name)) {
            // abort operation
            return;
          }
        }

        if (value.type !== 'JSXExpressionContainer' || isNonNullaryLiteral(value.expression)) {
          report(context, messages.stylePropNotObject, 'stylePropNotObject', {
            node,
          });
        } else if (value.expression.type === 'Identifier') {
          checkIdentifiers(value.expression);
        }
      },
    };
  },
};
