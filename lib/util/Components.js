/**
 * @fileoverview Utility class and functions for React components detection
 * @author Yannick Croissant
 */

'use strict';

const iterFrom = require('es-iterator-helpers/Iterator.from');
const map = require('es-iterator-helpers/Iterator.prototype.map');

const { getVariableFromContext } = require('./variable');
const { getFromContext } = require('./pragma');
const {
  findReturnStatement,
  isCallExpression,
  isFunctionLikeExpression,
  isMemberExpression,
} = require('./ast');
const {
  getParentES5Component,
  getParentES6Component,
  isES5Component,
  isES6Component,
} = require('./componentUtil');
const propTypesUtil = require('./propTypes');
const {
  isReturningJSX,
  isReturningOnlyNull,
} = require('./jsx');
const usedPropTypesUtil = require('./usedPropTypes');
const defaultPropsUtil = require('./defaultProps');
const isFirstLetterCapitalized = require('./isFirstLetterCapitalized');
const isDestructuredFromPragmaImport = require('./isDestructuredFromPragmaImport');
const {
  getScope,
  getText,
} = require('./eslint');

/** @type {(node: ASTNode) => string} */
function getId(node) {
  return node ? `${node.range[0]}:${node.range[1]}` : '';
}

/** @typedef {{ name: string, allNames: string[], node?: ASTNode }} Prop */
/** @typedef {{ node: ASTNode, confidence: number, usedPropTypes?: Prop[], hasDisplayName?: boolean, hasSCU?: boolean, setStateUsages?: (MemberExpressionComputedName | MemberExpressionNonComputedName)[], useSetState?: boolean, ignoreUnusedPropTypesValidation?: boolean, declaredPropTypes?: Record<string, { fullName: string, name: string, isRequired: boolean, node?: ASTNode }>, useThis?: boolean, useRef?: boolean, invalidReturn?: boolean, hasChildContextTypes?: boolean, useDecorators?: boolean, defaultProps?: 'unresolved' | Record<string, [string, ASTNode]>} }} Component */

/** @type {(propA: Prop, propB: Prop) => boolean} */
function usedPropTypesAreEquivalent(propA, propB) {
  if (propA.name === propB.name) {
    if (!propA.allNames && !propB.allNames) {
      return true;
    }
    if (Array.isArray(propA.allNames) && Array.isArray(propB.allNames) && propA.allNames.join('') === propB.allNames.join('')) {
      return true;
    }
    return false;
  }
  return false;
}

/** @type {(propsList: Prop[], newPropsList: Prop[]) => Prop[]} */
function mergeUsedPropTypes(propsList, newPropsList) {
  const propsToAdd = newPropsList.filter((newProp) => {
    const newPropIsAlreadyInTheList = propsList.some((prop) => usedPropTypesAreEquivalent(prop, newProp));
    return !newPropIsAlreadyInTheList;
  });

  return propsList.concat(propsToAdd);
}

const USE_HOOK_PREFIX_REGEX = /^use[A-Z]/;

/** @type {WeakMap<Components, Record<string, Component>>} */
const Lists = new WeakMap();
/** @type {WeakMap<Components, { defaultReactImports?: ImportDefaultSpecifier[], namedReactImports?: ImportSpecifier[] }>} */
const ReactImports = new WeakMap();

/**
 * Components
 */
class Components {
  constructor() {
    Lists.set(this, {});
    ReactImports.set(this, {});
  }

  /**
   * Add a node to the components list, or update it if it's already in the list
   *
   * @param {ASTNode} node The AST node being added.
   * @param {number} confidence Confidence in the component detection (0=banned, 1=maybe, 2=yes)
   * @returns {Component} Added component object
   */
  add(node, confidence) {
    const id = getId(node);
    const list = Lists.get(this);
    if (list[id]) {
      if (confidence === 0 || list[id].confidence === 0) {
        list[id].confidence = 0;
      } else {
        list[id].confidence = Math.max(list[id].confidence, confidence);
      }
      return list[id];
    }
    list[id] = {
      node,
      confidence,
    };
    return list[id];
  }

  /**
   * Find a component in the list using its node
   *
   * @param {ASTNode} node The AST node being searched.
   * @returns {Component | null} Component object, undefined if the component is not found or has confidence value of 0.
   */
  get(node) {
    const id = getId(node);
    const item = Lists.get(this)[id];
    if (item && item.confidence >= 1) {
      return item;
    }
    return null;
  }

  /**
   * Update a component in the list
   *
   * @param {ASTNode} node The AST node being updated.
   * @param {Object} props Additional properties to add to the component.
   */
  set(node, props) {
    const list = Lists.get(this);
    let component = list[getId(node)];
    while (!component || component.confidence < 1) {
      node = node.parent;
      if (!node) {
        return;
      }
      component = list[getId(node)];
    }

    Object.assign(
      component,
      props,
      {
        usedPropTypes: mergeUsedPropTypes(
          component.usedPropTypes || [],
          props.usedPropTypes || [],
        ),
      },
    );
  }

  /**
   * Return the components list
   * Components for which we are not confident are not returned
   *
   * @returns {Record<string, Component>} Components list
   */
  list() {
    const thisList = Lists.get(this);
    /** @type {Record<string, Component>} */
    const list = {};
    const usedPropTypes = {};

    // Find props used in components for which we are not confident
    Object.keys(thisList).filter((i) => thisList[i].confidence < 2).forEach((i) => {
      let component = null;
      let node = null;
      node = thisList[i].node;
      while (!component && node.parent) {
        node = node.parent;
        // Stop moving up if we reach a decorator
        if (node.type === 'Decorator') {
          break;
        }
        component = this.get(node);
      }
      if (component) {
        const newUsedProps = (thisList[i].usedPropTypes || []).filter((propType) => !propType.node || propType.node.kind !== 'init');

        const componentId = getId(component.node);

        usedPropTypes[componentId] = mergeUsedPropTypes(usedPropTypes[componentId] || [], newUsedProps);
      }
    });

    // Assign used props in not confident components to the parent component
    Object.keys(thisList).filter((j) => thisList[j].confidence >= 2).forEach((j) => {
      const id = getId(thisList[j].node);
      list[j] = thisList[j];
      if (usedPropTypes[id]) {
        list[j].usedPropTypes = mergeUsedPropTypes(list[j].usedPropTypes || [], usedPropTypes[id]);
      }
    });
    return list;
  }

  /**
   * Return the length of the components list
   * Components for which we are not confident are not counted
   *
   * @returns {number} Components list length
   */
  length() {
    const list = Lists.get(this);
    return Object.values(list).filter((component) => component.confidence >= 2).length;
  }

  /**
   * Return the node naming the default React import
   * It can be used to determine the local name of import, even if it's imported
   * with an unusual name.
   *
   * @returns {ImportDefaultSpecifier[]} React default import node
   */
  getDefaultReactImports() {
    return ReactImports.get(this).defaultReactImports;
  }

  /**
   * Return the nodes of all React named imports
   *
   * @returns {ImportSpecifier[]} The list of React named imports
   */
  getNamedReactImports() {
    return ReactImports.get(this).namedReactImports;
  }

  /**
   * Add the default React import specifier to the scope
   *
   * @param {ImportDefaultSpecifier} specifier The AST Node of the default React import
   * @returns {void}
   */
  addDefaultReactImport(specifier) {
    const info = ReactImports.get(this);
    ReactImports.set(this, { ...info, defaultReactImports: (info.defaultReactImports || []).concat(specifier) });
  }

  /**
   * Add a named React import specifier to the scope
   *
   * @param {ImportSpecifier} specifier The AST Node of a named React import
   * @returns {void}
   */
  addNamedReactImport(specifier) {
    const info = ReactImports.get(this);
    ReactImports.set(this, { ...info, namedReactImports: (info.namedReactImports || []).concat(specifier) });
  }
}

/** @type {(context: Context, pragma: string) => { property: string, object: string }[]} */
function getWrapperFunctions(context, pragma) {
  const componentWrapperFunctions = context.settings.componentWrapperFunctions || [];

  // eslint-disable-next-line arrow-body-style
  return componentWrapperFunctions.map((wrapperFunction) => {
    return typeof wrapperFunction === 'string'
      ? { property: wrapperFunction }
      : ({ ...wrapperFunction, object: wrapperFunction.object === '<pragma>' ? pragma : wrapperFunction.object });
  }).concat([
    { property: 'forwardRef', object: pragma },
    { property: 'memo', object: pragma },
  ]);
}

// eslint-disable-next-line valid-jsdoc
/**
 * Merge many eslint rules into one
 * @param {import('eslint').Rule.RuleModule[]} rules the returned values for eslint rule.create(context)
 * @returns {Partial<import('eslint').Rule.RuleModule>} merged rule
 */
function mergeRules(rules) {
  /** @type {Map<string, Function[]>} */
  const handlersByKey = new Map();
  rules.forEach((rule) => {
    Object.keys(rule).forEach((key) => {
      const fns = handlersByKey.get(key);
      if (!fns) {
        handlersByKey.set(key, [rule[key]]);
      } else {
        fns.push(rule[key]);
      }
    });
  });

  return Object.fromEntries(map(iterFrom(handlersByKey), ([key, value]) => [
    key,
    function mergedHandler(node) {
      value.forEach((fn) => {
        fn(node);
      });
    },
  ]));
}

/** @typedef {'useCallback' | 'useContext' | 'useDebugValue' | 'useEffect' | 'useImperativeHandle' | 'useLayoutEffect' | 'useMemo' | 'useReducer' | 'useRef' | 'useState'} HookNames */

/** @typedef {{ isDestructuredFromPragmaImport: (node: ASTNode, variable: string) => boolean, isReturningJSX: (node: ASTNode, strict?: boolean) => boolean, isReturningJSXOrNull: (node: ASTNode, strict?: boolean) => boolean, isReturningOnlyNull: (node: ASTNode) => boolean, isPragmaComponentWrapper: (node: ASTNode) => boolean, getPragmaComponentWrapper: (node: ASTNode) => ASTNode, getComponentNameFromJSXElement: (node: Expression) => null | string, getNameOfWrappedComponent: (node: undefined | CallExpressionArgument[]) => string | null, getDetectedComponents: () => (string | boolean)[], nodeWrapsComponent: (node: ASTNode) => boolean, findReturnStatement: typeof findReturnStatement, getParentComponent: (node: ASTNode) => ASTNode, isInAllowedPositionForComponent: (node: ASTNode) => boolean, getStatelessComponent: (node: ASTNode) => undefined | ASTNode, getParentStatelessComponent: (node: ASTNode & import('eslint').Rule.NodeParentExtension) => null | ASTNode, getRelatedComponent: (node: ASTNode) => null | Component, isParentComponentNotStatelessComponent: (node: ASTNode) => boolean, isReactHookCall: (node: ASTNode, expectedHookNames?: HookNames[]) => boolean }} Utils */

/** @typedef {(context: Context, components: Components, utils: Utils) => Partial<import('eslint').Rule.RuleListener>} DetectCallback */

/** @type {(rule: DetectCallback, context: Context) => import('eslint').Rule.RuleModule} */
function componentRule(rule, context) {
  const pragma = getFromContext(context);
  const components = new Components();
  const wrapperFunctions = getWrapperFunctions(context, pragma);

  /** @type {Utils} */
  // Utilities for component detection
  const utils = {
    isDestructuredFromPragmaImport(node, variable) {
      return isDestructuredFromPragmaImport(context, node, variable);
    },

    isReturningJSX(node, strict) {
      return isReturningJSX(context, node, strict, true);
    },

    isReturningJSXOrNull(node, strict) {
      return isReturningJSX(context, node, strict);
    },

    isReturningOnlyNull(node) {
      return isReturningOnlyNull(node, context);
    },

    getPragmaComponentWrapper(node) {
      /** @type {boolean} */
      let isPragmaComponentWrapper;
      let currentNode = node;
      let prevNode;
      do {
        currentNode = currentNode.parent;
        isPragmaComponentWrapper = this.isPragmaComponentWrapper(currentNode);
        if (isPragmaComponentWrapper) {
          prevNode = currentNode;
        }
      } while (isPragmaComponentWrapper);

      return prevNode;
    },

    getComponentNameFromJSXElement(node) {
      if (node.type !== 'JSXElement') {
        return null;
      }
      if (node.openingElement && node.openingElement.name && 'name' in node.openingElement.name && typeof node.openingElement.name.name === 'string') {
        return node.openingElement.name.name;
      }
      return null;
    },

    getNameOfWrappedComponent(node) {
      if (node.length < 1) {
        return null;
      }
      const firstArg = node[0];
      if (!('body' in firstArg) || !firstArg.body) {
        return null;
      }
      const { body } = firstArg;
      if (body.type === 'JSXElement') {
        return this.getComponentNameFromJSXElement(body);
      }
      if (body.type === 'BlockStatement') {
        const jsxElement = body.body.find((item) => item.type === 'ReturnStatement');
        return jsxElement
          && jsxElement.argument
          && this.getComponentNameFromJSXElement(jsxElement.argument);
      }
      return null;
    },

    getDetectedComponents() {
      const list = components.list();
      return Object.values(list).filter((val) => {
        if (val.node.type === 'ClassDeclaration') {
          return true;
        }
        if (
          val.node.type === 'ArrowFunctionExpression'
          && val.node.parent
          && val.node.parent.type === 'VariableDeclarator'
          && val.node.parent.id
        ) {
          return true;
        }
        return false;
      }).map((val) => {
        if (val.node.type === 'ArrowFunctionExpression') return 'id' in val.node.parent && 'name' in val.node.parent.id ? val.node.parent.id.name : undefined;
        return 'id' in val.node && val.node.id && 'name' in val.node.id && val.node.id.name;
      });
    },

    /** Checks whether memo/forwardRef is wrapping existing component or creating a new one. */
    nodeWrapsComponent(node) {
      const childComponent = this.getNameOfWrappedComponent('arguments' in node ? node.arguments : undefined);
      const componentList = this.getDetectedComponents();
      return !!childComponent && componentList.includes(childComponent);
    },

    isPragmaComponentWrapper(node) {
      if (!isCallExpression(node)) {
        return false;
      }

      return wrapperFunctions.some((wrapperFunction) => {
        if (isMemberExpression(node.callee)) {
          return wrapperFunction.object
            && 'name' in node.callee.object
            && wrapperFunction.object === node.callee.object.name
            && 'name' in node.callee.property
            && wrapperFunction.property === node.callee.property.name
            && !this.nodeWrapsComponent(node);
        }
        return 'name' in node.callee
          && wrapperFunction.property === node.callee.name
          && (!wrapperFunction.object
            // Functions coming from the current pragma need special handling
            || (wrapperFunction.object === pragma && this.isDestructuredFromPragmaImport(node, node.callee.name))
          );
      });
    },

    findReturnStatement,

    /** Get the parent component node from the current scope */
    getParentComponent(node) {
      return (
        getParentES6Component(context, node)
        || getParentES5Component(context, node)
        || utils.getParentStatelessComponent(node)
      );
    },

    isInAllowedPositionForComponent(node) {
      const { parent } = node;
      switch (parent.type) {
        case 'VariableDeclarator':
        case 'AssignmentExpression':
        case 'Property':
        case 'ReturnStatement':
        case 'ExportDefaultDeclaration':
        case 'ArrowFunctionExpression': {
          return true;
        }
        case 'SequenceExpression': {
          return utils.isInAllowedPositionForComponent(parent)
            && node === parent.expressions[parent.expressions.length - 1];
        }
        default:
          return false;
      }
    },

    /**
     * Get node if node is a stateless component, or node.parent in cases like
     * `React.memo` or `React.forwardRef`. Otherwise returns `undefined`.
     */
    getStatelessComponent(node) {
      const { parent } = node;
      if (
        node.type === 'FunctionDeclaration'
        && (!node.id || isFirstLetterCapitalized(node.id.name))
        && utils.isReturningJSXOrNull(node)
      ) {
        return node;
      }

      if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        const isPropertyAssignment = parent.type === 'AssignmentExpression'
          && isMemberExpression(parent.left);
        const isModuleExportsAssignment = isPropertyAssignment
          && 'object' in parent.left
          && 'name' in parent.left.object
          && parent.left.object.name === 'module'
          && 'name' in parent.left.property
          && parent.left.property.name === 'exports';

        if (parent.type === 'ExportDefaultDeclaration') {
          if (utils.isReturningJSX(node)) {
            return node;
          }
          return undefined;
        }

        if (parent.type === 'VariableDeclarator' && utils.isReturningJSXOrNull(node)) {
          if ('name' in parent.id && isFirstLetterCapitalized(parent.id.name)) {
            return node;
          }
          return undefined;
        }

        // case: const any = () => { return (props) => null }
        // case: const any = () => (props) => null
        if (
          (parent.type === 'ReturnStatement' || (parent.type === 'ArrowFunctionExpression' && parent.expression))
          && !utils.isReturningJSX(node)
        ) {
          return undefined;
        }

        // case: any = () => { return => null }
        // case: any = () => null
        if (parent.type === 'AssignmentExpression' && !isPropertyAssignment && utils.isReturningJSXOrNull(node)) {
          if ('name' in parent.left && isFirstLetterCapitalized(parent.left.name)) {
            return node;
          }
          return undefined;
        }

        // case: any = () => () => null
        if (parent.type === 'ArrowFunctionExpression' && parent.parent.type === 'AssignmentExpression' && !isPropertyAssignment && utils.isReturningJSXOrNull(node)) {
          if ('name' in parent.parent.left && isFirstLetterCapitalized(parent.parent.left.name)) {
            return node;
          }
          return undefined;
        }

        // case: { any: () => () => null }
        if (parent.type === 'ArrowFunctionExpression' && parent.parent.type === 'Property' && !isPropertyAssignment && utils.isReturningJSXOrNull(node)) {
          if ('name' in parent.parent.key && isFirstLetterCapitalized(parent.parent.key.name)) {
            return node;
          }
          return undefined;
        }

        // case: any = function() {return function() {return null;};}
        if (parent.type === 'ReturnStatement') {
          if (isFirstLetterCapitalized(node.id && node.id.name)) {
            return node;
          }
          const functionExpr = parent.parent.parent;
          if (functionExpr.parent.type === 'AssignmentExpression' && !isPropertyAssignment && utils.isReturningJSXOrNull(node)) {
            if ('name' in functionExpr.parent.left && isFirstLetterCapitalized(functionExpr.parent.left.name)) {
              return node;
            }
            return undefined;
          }
        }

        // case: { any: function() {return function() {return null;};} }
        if (parent.type === 'ReturnStatement') {
          const functionExpr = parent.parent.parent;
          if (functionExpr.parent.type === 'Property' && !isPropertyAssignment && utils.isReturningJSXOrNull(node)) {
            if ('name' in functionExpr.parent.key && isFirstLetterCapitalized(functionExpr.parent.key.name)) {
              return node;
            }
            return undefined;
          }
        }

        // for case abc = { [someobject.somekey]: props => { ... return not-jsx } }
        if (
          parent
          && 'key' in parent
          && isMemberExpression(parent.key)
          && !utils.isReturningJSX(node)
          && !utils.isReturningOnlyNull(node)
        ) {
          return undefined;
        }

        if (
          parent.type === 'Property'
          && (
            (parent.method && !parent.computed) // case: { f() { return ... } }
            || (!node.id && !parent.computed) // case: { f: () => ... }
          )
        ) {
          if (
            'name' in parent.key
            && isFirstLetterCapitalized(parent.key.name)
            && utils.isReturningJSX(node)
          ) {
            return node;
          }
          return undefined;
        }

        // Case like `React.memo(() => <></>)` or `React.forwardRef(...)`
        const pragmaComponentWrapper = utils.getPragmaComponentWrapper(node);
        if (pragmaComponentWrapper && utils.isReturningJSXOrNull(node)) {
          return pragmaComponentWrapper;
        }

        if (!(utils.isInAllowedPositionForComponent(node) && utils.isReturningJSXOrNull(node))) {
          return undefined;
        }

        if (utils.isParentComponentNotStatelessComponent(node)) {
          return undefined;
        }

        if (node.id) {
          return isFirstLetterCapitalized(node.id.name) ? node : undefined;
        }

        if (
          isPropertyAssignment
          && !isModuleExportsAssignment
          && 'property' in parent.left
          && 'name' in parent.left.property
          && !isFirstLetterCapitalized(parent.left.property.name)
        ) {
          return undefined;
        }

        if (parent.type === 'Property' && utils.isReturningOnlyNull(node)) {
          return undefined;
        }

        return node;
      }

      return undefined;
    },

    /** Get the parent stateless component node from the current scope */
    getParentStatelessComponent(node) {
      let scope = getScope(context, node);
      while (scope) {
        const statelessComponent = utils.getStatelessComponent(scope.block);
        if (statelessComponent) {
          return statelessComponent;
        }
        scope = scope.upper;
      }
      return null;
    },

    /**
     * Get the related component from a node
     *
     * @param {ASTNode} node The AST node being checked (must be a MemberExpression).
     * @returns {Component | Null} component node, null if we cannot find the component
     */
    getRelatedComponent(node) {
      let i;
      let j;
      let k;
      let l;
      let componentNode;
      // Get the component path
      const componentPath = [];
      let nodeTemp = node;
      while (nodeTemp) {
        if ('property' in nodeTemp) {
          const { property } = nodeTemp;
          if (property && property.type === 'Identifier') {
            componentPath.push(property.name);
          }
        }

        if ('object' in nodeTemp) {
          const { object } = nodeTemp;
          if (object && object.type === 'Identifier') {
            componentPath.push(object.name);
          }
          nodeTemp = object;
        } else {
          nodeTemp = null;
        }
      }
      componentPath.reverse();
      const componentName = componentPath.slice(0, componentPath.length - 1).join('.');

      // Find the variable in the current scope
      const variableName = componentPath.shift();
      if (!variableName) {
        return null;
      }
      const variableInScope = getVariableFromContext(context, node, variableName);
      if (!variableInScope) {
        return null;
      }

      // Try to find the component using variable references
      variableInScope.references.some((ref) => {
        let refId = ref.identifier;
        if (isMemberExpression(refId.parent)) {
          refId = refId.parent;
        }
        if (getText(context, refId) !== componentName) {
          return false;
        }
        if (isMemberExpression(refId)) {
          componentNode = refId.parent.right;
        } else if (
          refId.parent
          && refId.parent.type === 'VariableDeclarator'
          && refId.parent.init
          && refId.parent.init.type !== 'Identifier'
        ) {
          componentNode = refId.parent.init;
        }
        return true;
      });

      if (componentNode) {
        // Return the component
        return components.add(componentNode, 1);
      }

      // Try to find the component using variable declarations
      const { defs } = variableInScope;
      const defInScope = defs.find((def) => (
        def.type === 'ClassName'
        || def.type === 'FunctionName'
        || def.type === 'Variable'
      ));
      if (!defInScope || !defInScope.node) {
        return null;
      }
      componentNode = defInScope.node.init || defInScope.node;

      // Traverse the node properties to the component declaration
      for (i = 0, j = componentPath.length; i < j; i++) {
        if (!componentNode.properties) {
          continue; // eslint-disable-line no-continue
        }
        for (k = 0, l = componentNode.properties.length; k < l; k++) {
          if (componentNode.properties[k].key && componentNode.properties[k].key.name === componentPath[i]) {
            componentNode = componentNode.properties[k];
            break;
          }
        }
        if (!componentNode || !componentNode.value) {
          return null;
        }
        componentNode = componentNode.value;
      }

      // Return the component
      return components.add(componentNode, 1);
    },

    isParentComponentNotStatelessComponent(node) {
      return !!(
        node.parent
        && 'key' in node.parent
        && node.parent.key
        && node.parent.key.type === 'Identifier'
        // custom component functions must start with a capital letter (returns false otherwise)
        && node.parent.key.name.charAt(0) === node.parent.key.name.charAt(0).toLowerCase()
        // react render function cannot have params
        && (!('params' in node) || node.params.length > 0)
      );
    },

    /** Identify whether a node (CallExpression) is a call to a React hook */
    isReactHookCall(node, expectedHookNames) {
      if (!isCallExpression(node)) {
        return false;
      }

      const defaultReactImports = components.getDefaultReactImports();
      const namedReactImports = components.getNamedReactImports();

      const defaultReactImportName = defaultReactImports
        && defaultReactImports[0]
        && defaultReactImports[0].local.name;
      const reactHookImportSpecifiers = namedReactImports
        && namedReactImports.filter((specifier) => USE_HOOK_PREFIX_REGEX.test(specifier.imported.name));
      const reactHookImportNames = reactHookImportSpecifiers
        && /** @type {Record<HookNames, [string, string]>} */ (/** @type {unknown} */ (
          Object.fromEntries(reactHookImportSpecifiers.map((specifier) => [specifier.local.name, specifier.imported.name]))
        ));

      const isPotentialReactHookCall = defaultReactImportName
        && isMemberExpression(node.callee)
        && node.callee.object.type === 'Identifier'
        && node.callee.object.name === defaultReactImportName
        && node.callee.property.type === 'Identifier'
        && node.callee.property.name.match(USE_HOOK_PREFIX_REGEX);

      const isPotentialHookCall = reactHookImportNames
        && node.callee.type === 'Identifier'
        && node.callee.name.match(USE_HOOK_PREFIX_REGEX);

      const scope = (isPotentialReactHookCall || isPotentialHookCall) && getScope(context, node);

      const reactResolvedDefs = isPotentialReactHookCall
        && scope.references
        && scope.references.find((reference) => reference.identifier.name === defaultReactImportName).resolved.defs;

      const isReactShadowed = isPotentialReactHookCall && reactResolvedDefs
        && reactResolvedDefs.some((reactDef) => reactDef.type !== 'ImportBinding');

      const potentialHookReference = isPotentialHookCall
        && scope.references
        && scope.references.find(
          (reference) => reactHookImportNames[reference.identifier.name],
        );

      const hookResolvedDefs = potentialHookReference && potentialHookReference.resolved.defs;
      const localHookName = (
        isPotentialReactHookCall
          && 'property' in node.callee
          && 'name' in node.callee.property
          && node.callee.property.name
      ) || (
        isPotentialHookCall
        && potentialHookReference
        && 'name' in node.callee
        && node.callee.name
      );
      const isHookShadowed = isPotentialHookCall
        && hookResolvedDefs
        && hookResolvedDefs.some(
          (hookDef) => hookDef.name.name === localHookName
          && hookDef.type !== 'ImportBinding',
        );

      const isHookCall = (isPotentialReactHookCall && !isReactShadowed)
        || (isPotentialHookCall && localHookName && !isHookShadowed);

      if (!isHookCall) {
        return false;
      }

      if (!expectedHookNames) {
        return true;
      }

      return expectedHookNames.includes((reactHookImportNames && reactHookImportNames[localHookName]) || localHookName);
    },
  };

  // Component detection instructions
  const detectionInstructions = {
    /** @type {(node: CallExpression) => void} */
    CallExpression(node) {
      if (!utils.isPragmaComponentWrapper(node)) {
        return;
      }
      if (node.arguments.length > 0 && isFunctionLikeExpression(node.arguments[0])) {
        components.add(node, 2);
      }
    },

    /** @type {(node: ClassExpression) => void} */
    ClassExpression(node) {
      if (!isES6Component(node, context)) {
        return;
      }
      components.add(node, 2);
    },

    /** @type {(node: ClassDeclaration) => void} */
    ClassDeclaration(node) {
      if (!isES6Component(node, context)) {
        return;
      }
      components.add(node, 2);
    },

    /** @type {(node: ObjectExpression) => void} */
    ObjectExpression(node) {
      if (!isES5Component(node, context)) {
        return;
      }
      components.add(node, 2);
    },

    /** @type {(node: FunctionExpression) => void} */
    FunctionExpression(node) {
      if (node.async && node.generator) {
        components.add(node, 0);
        return;
      }

      const component = utils.getStatelessComponent(node);
      if (!component) {
        return;
      }
      components.add(component, 2);
    },

    /** @type {(node: FunctionDeclaration) => void} */
    FunctionDeclaration(node) {
      if (node.async && node.generator) {
        components.add(node, 0);
        return;
      }

      const cNode = utils.getStatelessComponent(node);
      if (!cNode) {
        return;
      }
      components.add(cNode, 2);
    },

    /** @type {(node: ArrowFunctionExpression) => void} */
    ArrowFunctionExpression(node) {
      const component = utils.getStatelessComponent(node);
      if (!component) {
        return;
      }
      components.add(component, 2);
    },

    /** @type {(node: ThisExpression) => void} */
    ThisExpression(node) {
      const component = utils.getParentStatelessComponent(node);
      if (!component || !/Function/.test(component.type) || !('property' in node.parent) || !node.parent.property) {
        return;
      }
      // Ban functions accessing a property on a ThisExpression
      components.add(node, 0);
    },
  };

  // Detect React import specifiers
  const reactImportInstructions = {
    /** @type {(node: ImportDeclaration) => void} */
    ImportDeclaration(node) {
      const isReactImported = node.source.type === 'Literal' && node.source.value === 'react';
      if (!isReactImported) {
        return;
      }

      node.specifiers.forEach((specifier) => {
        if (specifier.type === 'ImportDefaultSpecifier') {
          components.addDefaultReactImport(specifier);
        }
        if (specifier.type === 'ImportSpecifier') {
          components.addNamedReactImport(specifier);
        }
      });
    },
  };

  const ruleInstructions = rule(context, components, utils);
  const propTypesInstructions = propTypesUtil(context, components, utils);
  const usedPropTypesInstructions = usedPropTypesUtil(context, components, utils);
  const defaultPropsInstructions = defaultPropsUtil(context, components, utils);

  const mergedRule = mergeRules([
    detectionInstructions,
    propTypesInstructions,
    usedPropTypesInstructions,
    defaultPropsInstructions,
    reactImportInstructions,
    ruleInstructions,
  ]);

  return mergedRule;
}

module.exports = Object.assign(Components, {
  /** @type {(rule: DetectCallback) => import('eslint').Rule.RuleModule} */
  detect(rule) {
    return componentRule.bind(this, rule);
  },
});
