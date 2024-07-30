/**
 * @fileoverview Enforces consistent naming for boolean props
 * @author Ev Haus
 */

'use strict';

const Components = require('../util/Components');
const { isCallExpression } = require('../util/ast');
const {
  getTypeArguments,
  isPropTypesDeclaration,
} = require('../util/props');
const docsUrl = require('../util/docsUrl');
const { isPropWrapperFunction } = require('../util/propWrapper');
const report = require('../util/report');
const {
  getSourceCode,
  getText,
} = require('../util/eslint');

/**
 * Checks if prop is nested
 * @param {ASTNode} prop Property object, single prop type declaration
 * @returns {prop is Property & { value: CallExpression }}
 */
function nestedPropTypes(prop) {
  return (
    prop.type === 'Property'
    && 'value' in prop
    && isCallExpression(prop.value)
  );
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
  patternMismatch: 'Prop name `{{propName}}` doesn’t match rule `{{pattern}}`',
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      category: 'Stylistic Issues',
      description: 'Enforces consistent naming for boolean props',
      recommended: false,
      url: docsUrl('boolean-prop-naming'),
    },

    messages,

    schema: [{
      additionalProperties: false,
      properties: {
        propTypeNames: {
          items: {
            type: 'string',
          },
          minItems: 1,
          type: 'array',
          uniqueItems: true,
        },
        rule: {
          default: '^(is|has)[A-Z]([A-Za-z0-9]?)+',
          minLength: 1,
          type: 'string',
        },
        message: {
          minLength: 1,
          type: 'string',
        },
        validateNested: {
          default: false,
          type: 'boolean',
        },
      },
      type: 'object',
    }],
  },

  create: Components.detect((context, components, utils) => {
    const config = context.options[0] || {};
    const rule = config.rule ? new RegExp(config.rule) : null;
    const propTypeNames = config.propTypeNames || ['bool'];

    /** @type {Map<string, ASTNode[]>} */
    // Remembers all Flowtype object definitions
    const objectTypeAnnotations = new Map();

    /**
     * Returns the prop key to ensure we handle the following cases:
     * propTypes: {
     *   full: React.PropTypes.bool,
     *   short: PropTypes.bool,
     *   direct: bool,
     *   required: PropTypes.bool.isRequired
     * }
     * @param {ASTNode} node The node we're getting the name of
     * @returns {string | null}
     */
    function getPropKey(node) {
      // Check for `ExperimentalSpreadProperty` (eslint 3/4) and `SpreadElement` (eslint 5)
      // so we can skip validation of those fields.
      // Otherwise it will look for `node.value.property` which doesn't exist and breaks eslint.
      if (node.type === 'ExperimentalSpreadProperty' || node.type === 'SpreadElement') {
        return null;
      }
      if (
        'value' in node
        && node.value
        && typeof node.value === 'object'
        && 'property' in node.value
        && node.value.property
      ) {
        if ('name' in node.value.property) {
          const { name } = node.value.property;
          if (name === 'isRequired') {
            if (
              'object' in node.value
              && node.value.object
              && 'property' in node.value.object
              && node.value.object.property
              && 'name' in node.value.object.property
            ) {
              return node.value.object.property.name;
            }
            return null;
          }
          return name;
        }
        return null;
      }
      if (
        'value' in node
        && node.value
        && typeof node.value === 'object'
        && 'type' in node.value
        && node.value.type === 'Identifier'
        && 'name' in node.value
      ) {
        return node.value.name;
      }
      return null;
    }

    /**
     * Returns the name of the given node (prop)
     * @param {RuleProp} node The node we're getting the name of
     * @returns {string}
     */
    function getPropName(node) {
      // Due to this bug https://github.com/babel/babel-eslint/issues/307
      // we can't get the name of the Flow object key name. So we have
      // to hack around it for now.
      if (node.type === 'ObjectTypeProperty') {
        return getSourceCode(context).getFirstToken(node).value;
      }

      return 'key' in node && 'name' in node.key ? node.key.name : undefined;
    }

    /** @typedef {Parameters<typeof validatePropNaming>[1][number] | ObjectTypeProperty} RuleProp */

    /**
     * Checks if prop is declared in flow way
     * @param {RuleProp} prop Property object, single prop type declaration
     * @returns {boolean}
     */
    function flowCheck(prop) {
      return (
        prop.type === 'ObjectTypeProperty'
        && prop.value.type === 'BooleanTypeAnnotation'
        && rule.test(getPropName(prop)) === false
      );
    }

    /**
     * Checks if prop is declared in regular way
     * @param {RuleProp} prop Property object, single prop type declaration
     * @returns {boolean}
     */
    function regularCheck(prop) {
      const propKey = getPropKey(prop);
      return (
        propKey
        && propTypeNames.indexOf(propKey) >= 0
        && rule.test(getPropName(prop)) === false
      );
    }

    /** @type {(prop: RuleProp) => boolean} */
    function tsCheck(prop) {
      if (prop.type !== 'TSPropertySignature') return false;
      const { typeAnnotation } = prop.typeAnnotation || {};
      return (
        typeAnnotation
        && typeAnnotation.type === 'TSBooleanKeyword'
        && rule.test(getPropName(prop)) === false
      );
    }

    /**
     * Runs recursive check on all proptypes
     * @param {undefined | RuleProp[]} proptypes A list of Property object (for each proptype defined)
     * @param {(prop: RuleProp) => void} addInvalidProp callback to run for each error
     */
    function runCheck(proptypes, addInvalidProp) {
      if (proptypes) {
        proptypes.forEach((prop) => {
          if (config.validateNested && nestedPropTypes(prop)) {
            runCheck(prop.value.arguments[0].properties, addInvalidProp);
            return;
          }
          if (flowCheck(prop) || regularCheck(prop) || tsCheck(prop)) {
            addInvalidProp(prop);
          }
        });
      }
    }

    /**
     * Checks and mark props with invalid naming
     * @param {ASTNode} node The component node we're testing
     * @param {(ObjectLiteralElement | Property | RestElement)[]} proptypes A list of Property object (for each proptype defined)
     */
    function validatePropNaming(node, proptypes) {
      const component = components.get(node) || node;
      const invalidProps = 'invalidProps' in component ? component.invalidProps || [] : [];

      runCheck(proptypes, (prop) => {
        invalidProps.push(prop);
      });

      components.set(node, {
        invalidProps,
      });
    }

    /**
     * Reports invalid prop naming
     * @param {Object} component The component to process
     */
    function reportInvalidNaming(component) {
      component.invalidProps.forEach((propNode) => {
        const propName = getPropName(propNode);
        report(context, config.message || messages.patternMismatch, !config.message && 'patternMismatch', {
          node: propNode,
          data: {
            component: propName,
            propName,
            pattern: config.rule,
          },
        });
      });
    }

    /** @type {(node: ASTNode, args: undefined | CallExpressionArgument[]) => void} */
    function checkPropWrapperArguments(node, args) {
      if (!node || !Array.isArray(args)) {
        return;
      }
      args.filter((arg) => arg.type === 'ObjectExpression').forEach((object) => validatePropNaming(node, object.properties));
    }

    /** @type {(component: Components.Component) => GenericFlowNode} */
    function getComponentTypeAnnotation(component) {
      // If this is a functional component that uses a global type, check it
      if (
        (component.node.type === 'FunctionDeclaration' || component.node.type === 'ArrowFunctionExpression')
        && 'params' in component.node
        && component.node.params
        && component.node.params.length > 0
        && 'typeAnnotation' in component.node.params[0]
        && component.node.params[0].typeAnnotation
      ) {
        return component.node.params[0].typeAnnotation.typeAnnotation;
      }

      if (
        !component.node.parent
        || component.node.parent.type !== 'VariableDeclarator'
        || !component.node.parent.id
        || component.node.parent.id.type !== 'Identifier'
        || !component.node.parent.id.typeAnnotation
        || !component.node.parent.id.typeAnnotation.typeAnnotation
      ) {
        return;
      }

      const annotationTypeArguments = getTypeArguments(
        component.node.parent.id.typeAnnotation.typeAnnotation,
      );
      if (
        annotationTypeArguments && (
          annotationTypeArguments.type === 'TSTypeParameterInstantiation'
          || annotationTypeArguments.type === 'TypeParameterInstantiation'
        )
      ) {
        return annotationTypeArguments.params.find(
          (param) => param.type === 'TSTypeReference' || param.type === 'GenericTypeAnnotation',
        );
      }
    }

    /** @type {(identifier: Identifier, node: ASTNode) => void} */
    function findAllTypeAnnotations(identifier, node) {
      if (node.type === 'TSTypeLiteral' || node.type === 'ObjectTypeAnnotation' || node.type === 'TSInterfaceBody') {
        const currentNode = [].concat(
          objectTypeAnnotations.get(identifier.name) || [],
          node,
        );
        objectTypeAnnotations.set(identifier.name, currentNode);
      } else if (
        node.type === 'TSParenthesizedType'
        && (
          node.typeAnnotation.type === 'TSIntersectionType'
          || node.typeAnnotation.type === 'TSUnionType'
        )
      ) {
        node.typeAnnotation.types.forEach((type) => {
          findAllTypeAnnotations(identifier, type);
        });
      } else if (
        node.type === 'TSIntersectionType'
        || node.type === 'TSUnionType'
        || node.type === 'IntersectionTypeAnnotation'
        || node.type === 'UnionTypeAnnotation'
      ) {
        node.types.forEach((type) => {
          findAllTypeAnnotations(identifier, type);
        });
      }
    }

    // --------------------------------------------------------------------------
    // Public
    // --------------------------------------------------------------------------

    return {
      /** @param {ClassProperty | PropertyDefinitionNode} node */
      'ClassProperty, PropertyDefinition'(node) {
        if (!rule || !isPropTypesDeclaration(node)) {
          return;
        }
        if (
          'value' in node
          && node.value
          && typeof node.value === 'object'
          && isCallExpression(node.value)
          && isPropWrapperFunction(
            context,
            getText(context, node.value.callee),
          )
        ) {
          checkPropWrapperArguments(node, node.value.arguments);
        }
        if (
          'value' in node
          && node.value
          && 'properties' in node.value
          && node.value.properties
        ) {
          validatePropNaming(node, node.value.properties);
        }
        if (
          'typeAnnotation' in node
          && node.typeAnnotation
          && 'typeAnnotation' in node.typeAnnotation
          && node.typeAnnotation.typeAnnotation
        ) {
          validatePropNaming(node, node.typeAnnotation.typeAnnotation.properties);
        }
      },

      /** @param {MemberExpression} node */
      MemberExpression(node) {
        if (!rule || !isPropTypesDeclaration(node)) {
          return;
        }
        const component = utils.getRelatedComponent(node);
        if (!component || !('right' in node.parent) || !node.parent.right) {
          return;
        }
        const { right } = node.parent;
        if (
          isCallExpression(right)
          && isPropWrapperFunction(
            context,
            getText(context, right.callee),
          )
        ) {
          checkPropWrapperArguments(component.node, right.arguments);
          return;
        }
        validatePropNaming(component.node, node.parent.right.properties);
      },

      /** @param {ObjectExpression} node */
      ObjectExpression(node) {
        if (!rule) {
          return;
        }

        // Search for the proptypes declaration
        node.properties.forEach((property) => {
          if (!isPropTypesDeclaration(property) || !('value' in property) || !('properties' in property.value)) {
            return;
          }
          validatePropNaming(node, property.value.properties);
        });
      },

      /** @param {TypeAlias} node */
      TypeAlias(node) {
        findAllTypeAnnotations(node.id, node.right);
      },

      /** @param {TSTypeAliasDeclaration} node */
      TSTypeAliasDeclaration(node) {
        findAllTypeAnnotations(node.id, node.typeAnnotation);
      },

      /** @param {TSInterfaceDeclaration} node */
      TSInterfaceDeclaration(node) {
        findAllTypeAnnotations(node.id, node.body);
      },

      // eslint-disable-next-line object-shorthand
      'Program:exit'() {
        if (!rule) {
          return;
        }

        Object.values(components.list()).forEach((component) => {
          const annotation = getComponentTypeAnnotation(component);

          if (annotation) {
            let propType;
            if (annotation.type === 'GenericTypeAnnotation') {
              propType = objectTypeAnnotations.get(annotation.id.name);
            } else if (annotation.type === 'ObjectTypeAnnotation' || annotation.type === 'TSTypeLiteral') {
              propType = annotation;
            } else if (annotation.type === 'TSTypeReference') {
              propType = objectTypeAnnotations.get(annotation.typeName.name);
            } else if (annotation.type === 'TSIntersectionType') {
              propType = annotation.types.flatMap((type) => (
                type.type === 'TSTypeReference'
                  ? objectTypeAnnotations.get(type.typeName.name)
                  : type
              ));
            }

            if (propType) {
              [].concat(propType).filter(Boolean).forEach((prop) => {
                validatePropNaming(
                  component.node,
                  prop.properties || prop.members || prop.body,
                );
              });
            }
          }

          if (component.invalidProps && component.invalidProps.length > 0) {
            reportInvalidNaming(component);
          }
        });

        // Reset cache
        objectTypeAnnotations.clear();
      },
    };
  }),
};
