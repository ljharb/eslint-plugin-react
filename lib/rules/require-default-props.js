/**
 * @fileOverview Enforce a defaultProps definition for every prop that is not a required prop.
 * @author Vitor Balocco
 */

'use strict';

const Components = require('../util/Components');
const docsUrl = require('../util/docsUrl');
const {
  isClass,
  isFunctionLike,
} = require('../util/ast');
const report = require('../util/report');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  noDefaultWithRequired: 'propType "{{name}}" is required and should not have a defaultProps declaration.',
  shouldHaveDefault: 'propType "{{name}}" is not required, but has no corresponding defaultProps declaration.',
  noDefaultPropsWithFunction: 'Don’t use defaultProps with function components.',
  shouldAssignObjectDefault: 'propType "{{name}}" is not required, but has no corresponding default argument value.',
  destructureInSignature: 'Must destructure props in the function signature to initialize an optional prop.',
};

/** @param {AssignmentProperty | RestElement} prop */
function isPropWithNoDefaulVal(prop) {
  if (prop.type === 'RestElement' || prop.type === 'ExperimentalRestProperty') {
    return false;
  }
  return prop.value.type !== 'AssignmentPattern';
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Enforce a defaultProps definition for every prop that is not a required prop',
      category: 'Best Practices',
      url: docsUrl('require-default-props'),
    },

    messages,

    schema: [{
      type: 'object',
      properties: {
        forbidDefaultForRequired: {
          type: 'boolean',
        },
        classes: {
          enum: ['defaultProps', 'ignore'],
        },
        functions: {
          enum: ['defaultArguments', 'defaultProps', 'ignore'],
        },
        /**
         * @deprecated
         */
        ignoreFunctionalComponents: {
          type: 'boolean',
        },
      },
      additionalProperties: false,
    }],
  },

  create: Components.detect((context, components) => {
    const configuration = context.options[0] || {};
    const forbidDefaultForRequired = configuration.forbidDefaultForRequired || false;
    const classes = configuration.classes || 'defaultProps';
    /**
     * @todo
     * - Remove ignoreFunctionalComponents
     * - Change default to 'defaultArguments'
     */
    const functions = configuration.ignoreFunctionalComponents
      ? 'ignore'
      : configuration.functions || 'defaultProps';

    /**
     * Reports all propTypes passed in that don't have a defaultProps counterpart.
     * @param {Record<string, import('../util/Components').DeclaredPropType>} propTypes List of propTypes to check.
     * @param {import('../util/Components').DefaultPropMap | 'unresolved'} defaultProps Object of defaultProps to check. Keys are the props names.
     */
    function reportPropTypesWithoutDefault(propTypes, defaultProps) {
      Object.entries(propTypes).forEach(([propName, prop]) => {
        if (!prop.node) {
          return;
        }
        if (prop.isRequired) {
          if (forbidDefaultForRequired && defaultProps[propName]) {
            report(context, messages.noDefaultWithRequired, 'noDefaultWithRequired', {
              node: prop.node,
              data: { name: propName },
            });
          }
          return;
        }

        if (defaultProps[propName]) {
          return;
        }

        report(context, messages.shouldHaveDefault, 'shouldHaveDefault', {
          node: prop.node,
          data: { name: propName },
        });
      });
    }

    /**
     * If functions option is 'defaultArguments', reports defaultProps is used and all params that doesn't initialized.
     * @param {FunctionDeclaration | FunctionExpression | ArrowFunctionExpression} componentNode Node of component.
     * @param {import('../util/Components').DeclaredPropTypeMap} declaredPropTypes List of propTypes to check `isRequired`.
     * @param {import('../util/Components').DefaultPropMap | 'unresolved'} defaultProps Object of defaultProps to check used.
     */
    function reportFunctionComponent(componentNode, declaredPropTypes, defaultProps) {
      if (defaultProps) {
        report(context, messages.noDefaultPropsWithFunction, 'noDefaultPropsWithFunction', {
          node: componentNode,
        });
      }

      const props = componentNode.params[0];
      const propTypes = declaredPropTypes;

      if (!props) {
        return;
      }

      if (props.type === 'Identifier') {
        const hasOptionalProp = Object.values(propTypes).some((propType) => !propType.isRequired);
        if (hasOptionalProp) {
          report(context, messages.destructureInSignature, 'destructureInSignature', {
            node: props,
          });
        }
      } else if (props.type === 'ObjectPattern') {
        // Filter required props with default value and report error
        props.properties.filter((prop) => {
          const propName = prop && 'key' in prop && prop.key && 'name' in prop.key && prop.key.name;
          const isPropRequired = propTypes[propName] && propTypes[propName].isRequired;
          return propTypes[propName] && isPropRequired && !isPropWithNoDefaulVal(prop);
        }).forEach((prop) => {
          report(context, messages.noDefaultWithRequired, 'noDefaultWithRequired', {
            node: prop,
            data: { name: prop.key.name },
          });
        });

        // Filter non required props with no default value and report error
        props.properties.filter((prop) => {
          const propName = prop && 'key' in prop && prop.key && 'name' in prop.key && prop.key.name;
          const isPropRequired = propTypes[propName] && propTypes[propName].isRequired;
          return propTypes[propName] && !isPropRequired && isPropWithNoDefaulVal(prop);
        }).forEach((prop) => {
          report(context, messages.shouldAssignObjectDefault, 'shouldAssignObjectDefault', {
            node: prop,
            data: { name: prop.key.name },
          });
        });
      }
    }

    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------

    return {
      'Program:exit'() {
        Object.values(components.list()).filter(({ node, defaultProps, declaredPropTypes }) => {
          if (functions === 'ignore' && isFunctionLike(node)) {
            return false;
          }
          if (classes === 'ignore' && isClass(node)) {
            return false;
          }

          // If this defaultProps is "unresolved", then we should ignore this component and not report
          // any errors for it, to avoid false-positives with e.g. external defaultProps declarations or spread operators.
          if (defaultProps === 'unresolved') {
            return false;
          }
          return declaredPropTypes !== undefined;
        }).forEach(({ node, defaultProps, declaredPropTypes }) => {
          if (functions === 'defaultArguments' && isFunctionLike(node)) {
            reportFunctionComponent(
              node,
              declaredPropTypes,
              defaultProps,
            );
          } else {
            reportPropTypesWithoutDefault(
              declaredPropTypes,
              defaultProps || {},
            );
          }
        });
      },
    };
  }),
};
