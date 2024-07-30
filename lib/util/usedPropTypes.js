/**
 * @fileoverview Common used propTypes detection functionality.
 */

'use strict';

const {
  getKeyValue,
  inConstructor,
  isAssignmentLHS,
  isCallExpression,
  isFunctionLike,
  isFunctionLikeExpression,
  isMemberExpression,
  isObjectPattern,
  isThisExpression,
  isVariableDeclarator,
  unwrapTSAsExpression,
} = require('./ast');
const {
  getParentES5Component,
  getParentES6Component,
} = require('./componentUtil');
const { testReactVersion } = require('./version');
const {
  getScope,
  getSourceCode,
} = require('./eslint');

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const LIFE_CYCLE_METHODS = ['componentWillReceiveProps', 'shouldComponentUpdate', 'componentWillUpdate', 'componentDidUpdate'];
const ASYNC_SAFE_LIFE_CYCLE_METHODS = ['getDerivedStateFromProps', 'getSnapshotBeforeUpdate', 'UNSAFE_componentWillReceiveProps', 'UNSAFE_componentWillUpdate'];

function createPropVariables() {
  /** @type {Map<string, string[]>} Maps the variable to its definition. `props.a.b` is stored as `['a', 'b']` */
  let propVariables = new Map();
  let hasBeenWritten = false;
  const stack = [{ propVariables, hasBeenWritten }];
  return {
    pushScope() {
      // popVariables is not copied until first write.
      stack.push({ propVariables, hasBeenWritten: false });
    },
    popScope() {
      stack.pop();
      propVariables = stack[stack.length - 1].propVariables;
      hasBeenWritten = stack[stack.length - 1].hasBeenWritten;
    },
    /**
     * Add a variable name to the current scope
     * @param {string} name
     * @param {string[]} allNames Example: `props.a.b` should be formatted as `['a', 'b']`
     * @returns {Map<string, string[]>}
     */
    set(name, allNames) {
      if (!hasBeenWritten) {
        // copy on write
        propVariables = new Map(propVariables);
        Object.assign(stack[stack.length - 1], { propVariables, hasBeenWritten: true });
        stack[stack.length - 1].hasBeenWritten = true;
      }
      return propVariables.set(name, allNames);
    },
    /**
     * Get the definition of a variable.
     * @param {string} name
     * @returns {string[]} Example: `props.a.b` is represented by `['a', 'b']`
     */
    get(name) {
      return propVariables.get(name);
    },
  };
}

/** @type {(name: unknown) => name is 'props' | 'nextProps' | 'prevProps'} */
function isCommonVariableNameForProps(name) {
  return name === 'props' || name === 'nextProps' || name === 'prevProps';
}

/**
 * Checks if the component must be validated
 * @param {Object} component The component to process
 * @returns {boolean} True if the component must be validated, false if not.
 */
function mustBeValidated(component) {
  return !!(component && !component.ignorePropsValidation);
}

/**
 * Check if we are in a lifecycle method
 * @param {Context} context
 * @param {ASTNode} node The AST node being checked.
 * @param {boolean} checkAsyncSafeLifeCycles
 * @return {boolean} true if we are in a class constructor, false if not
 */
function inLifeCycleMethod(context, node, checkAsyncSafeLifeCycles) {
  let scope = getScope(context, node);
  while (scope) {
    if (scope.block && 'parent' in scope.block && scope.block.parent && scope.block.parent.key) {
      const { name } = scope.block.parent.key;

      if (LIFE_CYCLE_METHODS.indexOf(name) >= 0) {
        return true;
      }
      if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(name) >= 0) {
        return true;
      }
    }
    scope = scope.upper;
  }
  return false;
}

/**
 * Returns true if the given node is a React Component lifecycle method
 * @param {ASTNode} node The AST node being checked.
 * @param {boolean} checkAsyncSafeLifeCycles
 * @return {boolean} True if the node is a lifecycle method
 */
function isNodeALifeCycleMethod(node, checkAsyncSafeLifeCycles) {
  if ('key' in node && node.key) {
    if ('kind' in node && node.kind === 'constructor') {
      return true;
    }

    if (!('name' in node.key) || typeof node.key.name !== 'string') {
      return false;
    }

    if (LIFE_CYCLE_METHODS.indexOf(node.key.name) >= 0) {
      return true;
    }
    if (checkAsyncSafeLifeCycles && ASYNC_SAFE_LIFE_CYCLE_METHODS.indexOf(node.key.name) >= 0) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true if the given node is inside a React Component lifecycle
 * method.
 * @param {ASTNode} node The AST node being checked.
 * @param {boolean} checkAsyncSafeLifeCycles
 * @return {boolean} True if the node is inside a lifecycle method
 */
function isInLifeCycleMethod(node, checkAsyncSafeLifeCycles) {
  if (
    (node.type === 'MethodDefinition' || node.type === 'Property')
    && isNodeALifeCycleMethod(node, checkAsyncSafeLifeCycles)
  ) {
    return true;
  }

  if (node.parent) {
    return isInLifeCycleMethod(node.parent, checkAsyncSafeLifeCycles);
  }

  return false;
}

/**
 * Check if a function node is a setState updater
 * @param {ASTNode} node a function node
 * @return {boolean}
 */
function isSetStateUpdater(node) {
  const { parent } = node;
  const unwrappedParentCalleeNode = isCallExpression(parent)
    && unwrapTSAsExpression(parent.callee);

  return unwrappedParentCalleeNode
    && 'property' in unwrappedParentCalleeNode
    && unwrappedParentCalleeNode.property
    && 'name' in unwrappedParentCalleeNode.property
    && unwrappedParentCalleeNode.property.name === 'setState'
    // Make sure we are in the updater not the callback
    && 'arguments' in node.parent
    && node.parent.arguments[0] === node;
}

/** @type {(context: Context, node: ASTNode, name: unknown) => boolean} */
function isPropArgumentInSetStateUpdater(context, node, name) {
  if (typeof name !== 'string') {
    return;
  }
  let scope = getScope(context, node);
  while (scope) {
    const unwrappedParentCalleeNode = scope.block
      && 'parent' in scope.block
      && isCallExpression(scope.block.parent)
      && unwrapTSAsExpression(scope.block.parent.callee);
    if (
      unwrappedParentCalleeNode
      && 'property' in unwrappedParentCalleeNode
      && unwrappedParentCalleeNode.property
      && 'name' in unwrappedParentCalleeNode.property
      && unwrappedParentCalleeNode.property.name === 'setState'
      // Make sure we are in the updater not the callback
      && 'parent' in scope.block
      && isCallExpression(scope.block.parent)
      && scope.block.parent.arguments[0].range[0] === scope.block.range[0]
      && 'params' in scope.block.parent.arguments[0]
      && scope.block.parent.arguments[0].params
      && scope.block.parent.arguments[0].params.length > 1
    ) {
      const param = scope.block.parent.arguments[0].params[1];
      return 'name' in param && param.name === name;
    }
    scope = scope.upper;
  }
  return false;
}

/**
 * @param {Context} context
 * @param {ASTNode} node
 * @returns {boolean}
 */
function isInClassComponent(context, node) {
  return !!(getParentES6Component(context, node) || getParentES5Component(context, node));
}

/**
 * Checks if the node is `this.props`
 * @param {ASTNode | undefined} node
 * @returns {boolean}
 */
function isThisDotProps(node) {
  return isMemberExpression(node)
    && isThisExpression(unwrapTSAsExpression(node.object))
    && 'name' in node.property
    && node.property.name === 'props';
}

/**
 * Checks if the prop has spread operator.
 * @param {object} context
 * @param {ASTNode} node The AST node being marked.
 * @returns {boolean} True if the prop has spread operator, false if not.
 */
function hasSpreadOperator(context, node) {
  const tokens = getSourceCode(context).getTokens(node);
  return tokens.length && tokens[0].value === '...';
}

/**
 * Checks if the node is a propTypes usage of the form `this.props.*`, `props.*`, `prevProps.*`, or `nextProps.*`.
 * @param {Context} context
 * @param {ASTNode} node
 * @param {object} utils
 * @param {boolean} checkAsyncSafeLifeCycles
 * @returns {boolean}
 */
function isPropTypesUsageByMemberExpression(context, node, utils, checkAsyncSafeLifeCycles) {
  const unwrappedObjectNode = 'object' in node && unwrapTSAsExpression(node.object);

  if (!('name' in unwrappedObjectNode)) {
    return false;
  }

  if (isInClassComponent(context, node)) {
    // this.props.*
    if (isThisDotProps(unwrappedObjectNode)) {
      return true;
    }

    // props.* or prevProps.* or nextProps.*
    if (
      isCommonVariableNameForProps(unwrappedObjectNode.name)
      && (inLifeCycleMethod(context, node, checkAsyncSafeLifeCycles) || inConstructor(context, node))
    ) {
      return true;
    }
    // this.setState((_, props) => props.*))
    if (isPropArgumentInSetStateUpdater(context, node, unwrappedObjectNode.name)) {
      return true;
    }
    return false;
  }
  // props.* in function component
  return unwrappedObjectNode.name === 'props' && !isAssignmentLHS(node);
}

/**
 * Retrieve the name of a property node
 * @param {Context} context
 * @param {ASTNode} node The AST node with the property.
 * @param {Object} utils
 * @param {boolean} checkAsyncSafeLifeCycles
 * @return {string|undefined} the name of the property or undefined if not found
 */
function getPropertyName(context, node, utils, checkAsyncSafeLifeCycles) {
  if (('property' in node)) {
    const { property } = node;
    if (property) {
      if (isMemberExpression(property)) {
        return;
      }
      const { type } = property;
      if (type === 'Identifier') {
        if ('computed' in node && node.computed) {
          return '__COMPUTED_PROP__';
        }
        return property.name;
      }

      if (type === 'Literal') {
        // Accept computed properties that are literal strings
        if (typeof property.value === 'string') {
          return property.value;
        }
        // Accept number as well but only accept props[123]
        if (typeof property.value === 'number') {
          if (isPropTypesUsageByMemberExpression(context, node, utils, checkAsyncSafeLifeCycles)) {
            return property.raw;
          }
        }
      }

      if ('computed' in node && node.computed) {
        return '__COMPUTED_PROP__';
      }
    }
  }
}

/** @type {import('./Components').DetectCallback} */
module.exports = function usedPropTypesInstructions(context, components, utils) {
  const checkAsyncSafeLifeCycles = testReactVersion(context, '>= 16.3.0');

  const propVariables = createPropVariables();
  const { pushScope, popScope } = propVariables;

  /**
   * Mark a prop type as used
   * @param {ASTNode} node The AST node being marked.
   * @param {string[]} [parentNames]
   */
  function markPropTypesAsUsed(node, parentNames) {
    parentNames = parentNames || [];
    let type;
    let name;
    let allNames;
    let properties;
    if (isMemberExpression(node)) {
      name = getPropertyName(context, node, utils, checkAsyncSafeLifeCycles);
      if (name) {
        allNames = parentNames.concat(name);
        const { parent } = node;
        if (
        // Match props.foo.bar, don't match bar[props.foo]
          isMemberExpression(parent)
          && 'object' in parent
          && parent.object === node
        ) {
          markPropTypesAsUsed(parent, allNames);
        }
        // Handle the destructuring part of `const {foo} = props.a.b`
        if (
          isVariableDeclarator(parent)
            && parent.id.type === 'ObjectPattern'
        ) {
          parent.id.parent = parent; // patch for bug in eslint@4 in which ObjectPattern has no parent
          markPropTypesAsUsed(parent.id, allNames);
        }

        // const a = props.a
        if (
          isVariableDeclarator(parent)
            && parent.id.type === 'Identifier'
        ) {
          propVariables.set(parent.id.name, allNames);
        }
        // Do not mark computed props as used.
        type = name !== '__COMPUTED_PROP__' ? 'direct' : null;
      }
    } else if (isFunctionLike(node)) {
      if (node.params.length > 0) {
        type = 'destructuring';
        const propParam = isSetStateUpdater(node) ? node.params[1] : node.params[0];
        properties = propParam.type === 'AssignmentPattern'
          ? propParam.left.properties
          : propParam.properties;
      }
    } else if (isObjectPattern(node)) {
      type = 'destructuring';
      properties = node.properties;
    } else if (node.type !== 'TSEmptyBodyFunctionExpression') {
      throw new Error(`${node.type} ASTNodes are not handled by markPropTypesAsUsed`);
    }

    const component = components.get(utils.getParentComponent(node));
    const usedPropTypes = (component && component.usedPropTypes) || [];
    let ignoreUnusedPropTypesValidation = (component && component.ignoreUnusedPropTypesValidation) || false;

    if (type === 'direct') {
      // Ignore Object methods
      if (!(name in Object.prototype) && isMemberExpression(node)) {
        const reportedNode = node.property;
        usedPropTypes.push({
          name,
          allNames,
          node: reportedNode,
        });
      }
    } else if (type === 'destructuring') {
      for (let k = 0, l = (properties || []).length; k < l; k++) {
        if (hasSpreadOperator(context, properties[k]) || properties[k].computed) {
          ignoreUnusedPropTypesValidation = true;
          break;
        }
        const propName = getKeyValue(context, properties[k]);

        if (!propName || properties[k].type !== 'Property') {
          break;
        }

        usedPropTypes.push({
          allNames: parentNames.concat([propName]),
          name: propName,
          node: properties[k],
        });

        if (properties[k].value.type === 'ObjectPattern') {
          markPropTypesAsUsed(properties[k].value, parentNames.concat([propName]));
        } else if (properties[k].value.type === 'Identifier') {
          propVariables.set(properties[k].value.name, parentNames.concat(propName));
        }
      }
    }

    components.set(component ? component.node : node, {
      usedPropTypes,
      ignoreUnusedPropTypesValidation,
    });
  }

  /**
   * @param {ASTNode} node We expect either an ArrowFunctionExpression,
   *   FunctionDeclaration, or FunctionExpression
   */
  function markDestructuredFunctionArgumentsAsUsed(node) {
    const param = 'params' in node && node.params && (isSetStateUpdater(node) ? node.params[1] : node.params[0]);

    const destructuring = param && (
      param.type === 'ObjectPattern'
      || ((param.type === 'AssignmentPattern') && (param.left.type === 'ObjectPattern'))
    );

    if (destructuring && (components.get(node) || components.get(node.parent))) {
      markPropTypesAsUsed(node);
    }
  }

  /** @type {(node: ASTNode) => void} */
  function handleSetStateUpdater(node) {
    if (!('params' in node) || !node.params || node.params.length < 2 || !isSetStateUpdater(node)) {
      return;
    }
    markPropTypesAsUsed(node);
  }

  /**
   * Handle both stateless functions and setState updater functions.
   * @param {(FunctionDeclaration | ArrowFunctionExpression | FunctionExpression) & import('eslint').Rule.NodeParentExtension} node
   */
  function handleFunctionLikeExpressions(node) {
    pushScope();
    handleSetStateUpdater(node);
    markDestructuredFunctionArgumentsAsUsed(node);
  }

  /** @param {import('./Components').Component} component */
  function handleCustomValidators(component) {
    const propTypes = component.declaredPropTypes;
    if (!propTypes) {
      return;
    }

    Object.keys(propTypes).forEach((key) => {
      const { node } = propTypes[key];

      if (
        node
        && 'value' in node
        && node.value
        && isFunctionLikeExpression(node.value)) {
        markPropTypesAsUsed(node.value);
      }
    });
  }

  return {
    VariableDeclarator(node) {
      const unwrappedInitNode = 'init' in node && unwrapTSAsExpression(node.init);

      // let props = this.props
      if (
        isThisDotProps(unwrappedInitNode)
        && isInClassComponent(context, node)
        && 'id' in node
        && node.id.type === 'Identifier'
      ) {
        propVariables.set(node.id.name, []);
      }

      // Only handles destructuring
      if (
        !('id' in node)
        || node.id.type !== 'ObjectPattern'
        || !unwrappedInitNode
      ) {
        return;
      }

      // let {props: {firstname}} = this
      const propsProperty = node.id.properties.find((property) => (
        'key' in property
        && property.key
        && (
          ('name' in property.key && property.key.name === 'props')
          || ('value' in property.key && property.key.value === 'props')
        )
      ));

      if (astUtil.isThisExpression(unwrappedInitNode) && propsProperty && propsProperty.value.type === 'ObjectPattern') {
        markPropTypesAsUsed(propsProperty.value);
        return;
      }

      // let {props} = this
      if (
        isThisExpression(unwrappedInitNode)
        && propsProperty
        && 'value' in propsProperty
        && 'name' in propsProperty.value
        && propsProperty.value.name === 'props'
      ) {
        propVariables.set('props', []);
        return;
      }

      // let {firstname} = props
      if (
        'name' in unwrappedInitNode
        && isCommonVariableNameForProps(unwrappedInitNode.name)
        && (utils.getParentStatelessComponent(node) || isInLifeCycleMethod(node, checkAsyncSafeLifeCycles))
      ) {
        markPropTypesAsUsed(node.id);
        return;
      }

      // let {firstname} = this.props
      if (isThisDotProps(unwrappedInitNode) && isInClassComponent(context, node)) {
        markPropTypesAsUsed(node.id);
        return;
      }

      // let {firstname} = thing, where thing is defined by const thing = this.props.**.*
      if (
        'name' in unwrappedInitNode
        && typeof unwrappedInitNode.name === 'string'
        && propVariables.get(unwrappedInitNode.name)
      ) {
        markPropTypesAsUsed(node.id, propVariables.get(unwrappedInitNode.name));
      }
    },

    FunctionDeclaration: handleFunctionLikeExpressions,

    ArrowFunctionExpression: handleFunctionLikeExpressions,

    FunctionExpression: handleFunctionLikeExpressions,

    'FunctionDeclaration:exit': popScope,

    'ArrowFunctionExpression:exit': popScope,

    'FunctionExpression:exit': popScope,

    /** @param {JSXSpreadAttribute} node */
    JSXSpreadAttribute(node) {
      const component = components.get(utils.getParentComponent(node));
      components.set(component ? component.node : node, {
        ignoreUnusedPropTypesValidation: node.argument.type !== 'ObjectExpression',
      });
    },

    /** @param {MemberExpression | OptionalMemberExpression} node */
    'MemberExpression, OptionalMemberExpression'(node) {
      if (isPropTypesUsageByMemberExpression(context, node, utils, checkAsyncSafeLifeCycles)) {
        markPropTypesAsUsed(node);
        return;
      }

      const propVariable = propVariables.get(unwrapTSAsExpression(node.object).name);
      if (propVariable) {
        markPropTypesAsUsed(node, propVariable);
      }
    },

    ObjectPattern(node) {
      // If the object pattern is a destructured props object in a lifecycle
      // method -- mark it for used props.
      if (isNodeALifeCycleMethod(node.parent.parent, checkAsyncSafeLifeCycles) && node.properties.length > 0) {
        markPropTypesAsUsed(node.parent);
      }
    },

    'Program:exit'() {
      Object.values(components.list())
        .filter((component) => mustBeValidated(component))
        .forEach((component) => {
          handleCustomValidators(component);
        });
    },
  };
};
