/**
 * @fileoverview Prevent common casing typos
 */

'use strict';

const PROP_TYPES = Object.keys(require('prop-types'));
const Components = require('../util/Components');
const docsUrl = require('../util/docsUrl');
const {
  isCallExpression,
  isMemberExpression,
} = require('../util/ast');
const {
  isES5Component,
  isES6Component,
} = require('../util/componentUtil');
const report = require('../util/report');
const lifecycleMethods = require('../util/lifecycleMethods');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const STATIC_CLASS_PROPERTIES = ['propTypes', 'contextTypes', 'childContextTypes', 'defaultProps'];

const messages = /** @types {const} */ ({
  typoPropTypeChain: 'Typo in prop type chain qualifier: {{name}}',
  typoPropType: 'Typo in declared prop type: {{name}}',
  typoStaticClassProp: 'Typo in static class property declaration',
  typoPropDeclaration: 'Typo in property declaration',
  typoLifecycleMethod: 'Typo in component lifecycle method declaration: {{actual}} should be {{expected}}',
  staticLifecycleMethod: 'Lifecycle method should be static: {{method}}',
  noPropTypesBinding: '`\'prop-types\'` imported without a local `PropTypes` binding.',
  noReactBinding: '`\'react\'` imported without a local `React` binding.',
});

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow common typos',
      category: 'Stylistic Issues',
      recommended: false,
      url: docsUrl('no-typos'),
    },

    messages,

    schema: [],
  },

  create: Components.detect((context, components, utils) => {
    /** @type {string | null} */
    let propTypesPackageName = null;
    /** @type {string | null} */
    let reactPackageName = null;

    function checkValidPropTypeQualifier(node) {
      if (node.name !== 'isRequired') {
        report(context, messages.typoPropTypeChain, 'typoPropTypeChain', {
          node,
          data: { name: node.name },
        });
      }
    }

    function checkValidPropType(node) {
      if (node.name && !PROP_TYPES.some((propTypeName) => propTypeName === node.name)) {
        report(context, messages.typoPropType, 'typoPropType', {
          node,
          data: { name: node.name },
        });
      }
    }

    /** @param {Expression | Super} node */
    function isPropTypesPackage(node) {
      return (
        node.type === 'Identifier'
        && node.name === propTypesPackageName
      ) || (
        isMemberExpression(node)
        && 'name' in node.property
        && node.property.name === 'PropTypes'
        && 'name' in node.object
        && node.object.name === reactPackageName
      );
    }

    /* eslint-disable no-use-before-define */

    /** @param {CallExpression} node */
    function checkValidCallExpression(node) {
      const { callee } = node;
      if (isMemberExpression(callee) && 'name' in callee.property) {
        if (callee.property.name === 'shape') {
          checkValidPropObject(node.arguments[0]);
        } else if (callee.property.name === 'oneOfType') {
          const args = node.arguments[0];
          if (args && args.type === 'ArrayExpression') {
            args.elements.forEach((el) => {
              checkValidProp(el);
            });
          }
        }
      }
    }

    function checkValidProp(node) {
      if ((!propTypesPackageName && !reactPackageName) || !node) {
        return;
      }

      if (isMemberExpression(node)) {
        if (
          isMemberExpression(node.object)
          && isPropTypesPackage(node.object.object)
        ) { // PropTypes.myProp.isRequired
          checkValidPropType(node.object.property);
          checkValidPropTypeQualifier(node.property);
        } else if (
          isPropTypesPackage(node.object)
          && node.property.name !== 'isRequired'
        ) { // PropTypes.myProp
          checkValidPropType(node.property);
        } else if (isCallExpression(node.object)) {
          checkValidPropTypeQualifier(node.property);
          checkValidCallExpression(node.object);
        }
      } else if (isCallExpression(node)) {
        checkValidCallExpression(node);
      }
    }

    /* eslint-enable no-use-before-define */

    /** @param {Expression | SpreadElement | CallExpressionArgument} node */
    function checkValidPropObject(node) {
      if (node && node.type === 'ObjectExpression') {
        node.properties.forEach((prop) => checkValidProp(prop.value));
      }
    }

    function reportErrorIfPropertyCasingTypo(propertyValue, propertyKey, isClassProperty) {
      const propertyName = propertyKey.name;
      if (propertyName === 'propTypes' || propertyName === 'contextTypes' || propertyName === 'childContextTypes') {
        checkValidPropObject(propertyValue);
      }
      STATIC_CLASS_PROPERTIES.forEach((CLASS_PROP) => {
        if (propertyName && CLASS_PROP.toLowerCase() === propertyName.toLowerCase() && CLASS_PROP !== propertyName) {
          const messageId = isClassProperty
            ? 'typoStaticClassProp'
            : 'typoPropDeclaration';
          report(context, messages[messageId], messageId, {
            node: propertyKey,
          });
        }
      });
    }

    function reportErrorIfLifecycleMethodCasingTypo(node) {
      const { key } = node;
      let nodeKeyName = key.name;
      if (key.type === 'Literal') {
        nodeKeyName = key.value;
      }
      if (key.type === 'PrivateName' || (node.computed && typeof nodeKeyName !== 'string')) {
        return;
      }

      lifecycleMethods.static.forEach((method) => {
        if (!node.static && nodeKeyName && nodeKeyName.toLowerCase() === method.toLowerCase()) {
          report(context, messages.staticLifecycleMethod, 'staticLifecycleMethod', {
            node,
            data: {
              method: nodeKeyName,
            },
          });
        }
      });

      lifecycleMethods.instance.concat(lifecycleMethods.static).forEach((method) => {
        if (nodeKeyName && method.toLowerCase() === nodeKeyName.toLowerCase() && method !== nodeKeyName) {
          report(context, messages.typoLifecycleMethod, 'typoLifecycleMethod', {
            node,
            data: { actual: nodeKeyName, expected: method },
          });
        }
      });
    }

    return {
      ImportDeclaration(node) {
        if (node.source && node.source.value === 'prop-types') { // import PropType from "prop-types"
          if (node.specifiers.length > 0) {
            propTypesPackageName = node.specifiers[0].local.name;
          } else {
            report(context, messages.noPropTypesBinding, 'noPropTypesBinding', {
              node,
            });
          }
        } else if (node.source && node.source.value === 'react') { // import { PropTypes } from "react"
          if (node.specifiers.length > 0) {
            reactPackageName = node.specifiers[0].local.name; // guard against accidental anonymous `import "react"`
          } else {
            report(context, messages.noReactBinding, 'noReactBinding', {
              node,
            });
          }
          if (node.specifiers.length >= 1) {
            const propTypesSpecifier = node.specifiers.find((specifier) => (
              'imported' in specifier
              && specifier.imported
              && specifier.imported.name === 'PropTypes'
            ));
            if (propTypesSpecifier) {
              propTypesPackageName = propTypesSpecifier.local.name;
            }
          }
        }
      },

      /** @param {ClassProperty | PropertyDefinition} node */
      'ClassProperty, PropertyDefinition'(node) {
        if (
          !('static' in node)
          || !node.static
          || !('parent' in node.static)
          || !('parent' in node.static.parent)
          || !isES6Component(node.parent.parent, context)
        ) {
          return;
        }

        reportErrorIfPropertyCasingTypo(node.value, node.key, true);
      },

      MemberExpression(node) {
        const propertyName = 'name' in node.property ? node.property.name : undefined;

        if (
          !propertyName
          || STATIC_CLASS_PROPERTIES.map((prop) => prop.toLocaleLowerCase()).indexOf(propertyName.toLowerCase()) === -1
        ) {
          return;
        }

        const relatedComponent = utils.getRelatedComponent(node);

        if (
          relatedComponent
            && (isES6Component(relatedComponent.node, context) || (
              relatedComponent.node.type !== 'ClassDeclaration' && utils.isReturningJSX(relatedComponent.node)))
            && (node.parent && node.parent.type === 'AssignmentExpression' && node.parent.right)
        ) {
          reportErrorIfPropertyCasingTypo(node.parent.right, node.property, true);
        }
      },

      MethodDefinition(node) {
        if (!isES6Component(node.parent.parent, context)) {
          return;
        }

        reportErrorIfLifecycleMethodCasingTypo(node);
      },

      ObjectExpression(node) {
        const component = isES5Component(node, context) && components.get(node);

        if (!component) {
          return;
        }

        node.properties.filter((property) => property.type !== 'SpreadElement').forEach((property) => {
          reportErrorIfPropertyCasingTypo(property.value, property.key, false);
          reportErrorIfLifecycleMethodCasingTypo(property);
        });
      },
    };
  }),
};
