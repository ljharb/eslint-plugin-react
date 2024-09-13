/**
 * @fileoverview Prevent declaring unused methods and properties of component class
 * @author Paweł Nowak, Berton Zhu
 */

'use strict';

const docsUrl = require('../util/docsUrl');
const {
  isES5Component,
  isES6Component,
} = require('../util/componentUtil');
const report = require('../util/report');
const {
  isThisExpression,
  uncast,
} = require('../util/ast');

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const LIFECYCLE_METHODS = new Set(/** @type {const} */ ([
  'constructor',
  'componentDidCatch',
  'componentDidMount',
  'componentDidUpdate',
  'componentWillMount',
  'componentWillReceiveProps',
  'componentWillUnmount',
  'componentWillUpdate',
  'getChildContext',
  'getSnapshotBeforeUpdate',
  'render',
  'shouldComponentUpdate',
  'UNSAFE_componentWillMount',
  'UNSAFE_componentWillReceiveProps',
  'UNSAFE_componentWillUpdate',
]));

const ES6_LIFECYCLE = new Set(/** @type {const} */ ([
  'state',
]));

const ES5_LIFECYCLE = new Set(/** @type {const} */ ([
  'getInitialState',
  'getDefaultProps',
  'mixins',
]));

/** @param {ClassProperty | MethodDefinition | PropertyDefinition | MemberExpression | Property | RestElement | AssignmentProperty} node @param {PrivateIdentifier | Expression} property */
function isKeyLiteralLike(node, property) {
  return property.type === 'Literal'
     || (property.type === 'TemplateLiteral' && property.expressions.length === 0)
     || ('computed' in node && node.computed === false && property.type === 'Identifier');
}

// Return the name of an identifier or the string value of a literal. Useful
// anywhere that a literal may be used as a key (e.g., member expressions,
// method definitions, ObjectExpression property keys).
/** @param {ASTNode} node */
function getName(node) {
  node = uncast(node);

  if (node.type === 'Identifier') {
    return 'name' in node && node.name;
  }
  if (node.type === 'Literal') {
    return String('value' in node ? node.value : undefined);
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.raw;
  }
  return null;
}

/** @param {ClassDeclaration | ObjectExpression} node */
function getInitialClassInfo(node, isClass) {
  return {
    classNode: node,
    isClass,
    // Set of nodes where properties were defined.
    properties: new Set(),

    // Set of names of properties that we've seen used.
    usedProperties: new Set(),

    inStatic: false,
  };
}

const messages = /** @type {const} */ ({
  unused: 'Unused method or property "{{name}}"',
  unusedWithClass: 'Unused method or property "{{name}}" of class "{{className}}"',
});

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow declaring unused methods of component class',
      category: 'Best Practices',
      recommended: false,
      url: docsUrl('no-unused-class-component-methods'),
    },
    messages,
    schema: [],
  },

  create: ((context) => {
    let classInfo = null;

    // Takes an ObjectExpression node and adds all named Property nodes to the
    // current set of properties.
    function addProperty(node) {
      classInfo.properties.add(node);
    }

    // Adds the name of the given node as a used property if the node is an
    // Identifier or a Literal. Other node types are ignored.
    /** @param {Expression | PrivateIdentifier | undefined} node */
    function addUsedProperty(node) {
      const name = node && getName(node);
      if (name) {
        classInfo.usedProperties.add(name);
      }
    }

    function reportUnusedProperties() {
      // Report all unused properties.
      for (const node of classInfo.properties) { // eslint-disable-line no-restricted-syntax
        const name = getName(node);
        if (
          !classInfo.usedProperties.has(name)
           && !LIFECYCLE_METHODS.has(name)
           && (classInfo.isClass ? !ES6_LIFECYCLE.has(name) : !ES5_LIFECYCLE.has(name))
        ) {
          const className = (classInfo.classNode.id && classInfo.classNode.id.name) || '';

          const messageID = className ? 'unusedWithClass' : 'unused';
          report(
            context,
            messages[messageID],
            messageID,
            {
              node,
              data: {
                name,
                className,
              },
            },
          );
        }
      }
    }

    function exitMethod() {
      if (!classInfo || !classInfo.inStatic) {
        return;
      }

      classInfo.inStatic = false;
    }

    return {
      ClassDeclaration(node) {
        if (isES6Component(node, context)) {
          classInfo = getInitialClassInfo(node, true);
        }
      },

      ObjectExpression(node) {
        if (isES5Component(node, context)) {
          classInfo = getInitialClassInfo(node, false);
        }
      },

      'ClassDeclaration:exit'() {
        if (!classInfo) {
          return;
        }
        reportUnusedProperties();
        classInfo = null;
      },

      'ObjectExpression:exit'(node) {
        if (!classInfo || classInfo.classNode !== node) {
          return;
        }
        reportUnusedProperties();
        classInfo = null;
      },

      Property(node) {
        if (!classInfo || classInfo.classNode !== node.parent) {
          return;
        }

        if (isKeyLiteralLike(node, node.key)) {
          addProperty(node.key);
        }
      },

      /** @param {ClassProperty | MethodDefinition | PropertyDefinition} node */
      'ClassProperty, MethodDefinition, PropertyDefinition'(node) {
        if (!classInfo) {
          return;
        }

        if ('static' in node && node.static) {
          classInfo.inStatic = true;
          return;
        }

        if (isKeyLiteralLike(node, node.key)) {
          addProperty(node.key);
        }
      },

      'ClassProperty:exit': exitMethod,
      'MethodDefinition:exit': exitMethod,
      'PropertyDefinition:exit': exitMethod,

      MemberExpression(node) {
        if (!classInfo || classInfo.inStatic) {
          return;
        }

        if (isThisExpression(node.object) && isKeyLiteralLike(node, node.property)) {
          if (node.parent.type === 'AssignmentExpression' && node.parent.left === node) {
            // detect `this.property = xxx`
            addProperty(node.property);
          } else {
            // detect `this.property()`, `x = this.property`, etc.
            addUsedProperty(node.property);
          }
        }
      },

      VariableDeclarator(node) {
        if (!classInfo || classInfo.inStatic) {
          return;
        }

        // detect `{ foo, bar: baz } = this`
        if (node.init && isThisExpression(node.init) && node.id.type === 'ObjectPattern') {
          node.id.properties
            .filter((prop) => prop.type === 'Property' && isKeyLiteralLike(prop, prop.key))
            .forEach((prop) => {
              addUsedProperty('key' in prop ? prop.key : undefined);
            });
        }
      },
    };
  }),
};
