import eslint, { type Rule } from 'eslint';
import type { Node, SpreadElement } from 'estree';
import type ESTree from 'estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

declare global {
  type Scope = eslint.Scope.Scope;
  type Token = eslint.AST.Token;
  type Fixer = eslint.Rule.RuleFixer;

  type ArrowFunctionExpression = ESTree.ArrowFunctionExpression | TSESTree.ArrowFunctionExpression;
  type AssignmentProperty = ESTree.AssignmentProperty;
  type CallExpression = ESTree.CallExpression | TSESTree.CallExpression;
  type CallExpressionArgument = ESTree.CallExpression['arguments'][number] | TSESTree.CallExpressionArgument;
  type ClassDeclaration = ESTree.ClassDeclaration | TSESTree.ClassDeclaration;
  type ClassElement = TSESTree.ClassElement;
  type ClassExpression = ESTree.ClassExpression | TSESTree.ClassExpression;
  type ConditionalExpression = ESTree.ConditionalExpression | TSESTree.ConditionalExpression;
  type EntityName = TSESTree.EntityName;
  type ExportNamedDeclaration = TSESTree.ExportNamedDeclaration;
  type Expression = ESTree.Expression | TSESTree.Expression;
  type ExpressionStatement = TSESTree.ExpressionStatement;
  type FunctionDeclaration = TSESTree.FunctionDeclaration;
  type FunctionExpression = TSESTree.FunctionExpression;
  type Identifier = ESTree.Identifier | TSESTree.Identifier;
  type ImportDeclaration = TSESTree.ImportDeclaration;
  type ImportDefaultSpecifier = TSESTree.ImportDefaultSpecifier;
  type ImportSpecifier = TSESTree.ImportSpecifier;
  type JSXAttribute = TSESTree.JSXAttribute;
  type JSXChild = TSESTree.JSXChild;
  type JSXClosingElement = TSESTree.JSXClosingElement;
  type JSXClosingFragment = TSESTree.JSXClosingFragment;
  type JSXElement = TSESTree.JSXElement;
  type JSXExpressionContainer = TSESTree.JSXExpressionContainer;
  type JSXEmptyExpression = TSESTree.JSXEmptyExpression;
  type JSXFragment = TSESTree.JSXFragment;
  type JSXIdentifier = TSESTree.JSXIdentifier;
  type JSXOpeningElement = TSESTree.JSXOpeningElement;
  type JSXOpeningFragment = TSESTree.JSXOpeningFragment;
  type JSXSpreadAttribute = TSESTree.JSXSpreadAttribute;
  type JSXText = TSESTree.JSXText;
  type Literal = ESTree.Literal | TSESTree.Literal;
  type LogicalExpression = ESTree.LogicalExpression | TSESTree.LogicalExpression;
  type MemberExpression = ESTree.MemberExpression | TSESTree.MemberExpression;
  type MemberExpressionComputedName = TSESTree.MemberExpressionComputedName;
  type MemberExpressionNonComputedName = TSESTree.MemberExpressionNonComputedName;
  type MethodDefinition = TSESTree.MethodDefinition;
  type ObjectExpression = TSESTree.ObjectExpression;
  type ObjectLiteralElement = TSESTree.ObjectLiteralElement;
  type ObjectPattern = ESTree.ObjectPattern | TSESTree.ObjectPattern;
  type OptionalCallExpression = ESTree.CallExpression & { optional: true };
  type OptionalMemberExpression = MemberExpression & { optional: true };
  type Parameter = TSESTree.Parameter;
  type Pattern = ESTree.Pattern;
  type PrivateIdentifier = TSESTree.PrivateIdentifier;
  type Property = TSESTree.Property;
  type PropertyDefinitionNode = TSESTree.PropertyDefinition;
  type RestElement = TSESTree.RestElement;
  type ReturnStatement = TSESTree.ReturnStatement;
  type SpreadElement = ESTree.SpreadElement | TSESTree.SpreadElement;
  type Statement = TSESTree.Statement;
  type TemplateLiteral = ESTree.TemplateLiteral | TSESTree.TemplateLiteral;
  type ThisExpression = TSESTree.ThisExpression;
  type TSAsExpression = TSESTree.TSAsExpression;
  type TSInterfaceDeclaration = TSESTree.TSInterfaceDeclaration;
  type TSInterfaceHeritage = TSESTree.TSInterfaceHeritage;
  type TSIntersectionType = TSESTree.TSIntersectionType;
  type TSQualifiedName = TSESTree.TSQualifiedName;
  type TSTypeAliasDeclaration = TSESTree.TSTypeAliasDeclaration;
  type TSTypeAnnotation = TSESTree.TSTypeAnnotation;
  type TSTypeLiteral = TSESTree.TSTypeLiteral;
  type TSTypeReference = TSESTree.TSTypeReference;
  type VariableDeclaration = TSESTree.VariableDeclaration;
  type VariableDeclarator = TSESTree.VariableDeclarator;
  type Super = ESTree.Super | TSESTree.Super;

  type GenericFlowNode = {
    type: string;
    types: GenericFlowNode[];
    typeAnnotation: GenericFlowNode;
    right?: ASTNode;
  };

  type GenericTypeAnnotation = GenericFlowNode; // TODO
  type ImportBinding = GenericFlowNode; // TODO
  type ClassProperty =  Omit<ClassElement, 'type'> & {
    type: 'ClassProperty';
  }; // TODO
  type TypeAlias = GenericFlowNode & { id: Identifier, right: ASTNode }; // TODO
  interface ExperimentalSpreadProperty extends Omit<SpreadElement, 'type'> {
    type: 'ExperimentalSpreadProperty'
  }
  type ObjectTypeAnnotation = GenericFlowNode; // TODO
  type BooleanTypeAnnotation = GenericFlowNode; // TODO
  type ObjectTypeProperty = GenericFlowNode & {
    value: BooleanTypeAnnotation
  }; // TODO

  type BabelTypes =
    | ImportBinding
    | ClassProperty
    | TypeAlias
    | ExperimentalSpreadProperty
    | ObjectTypeAnnotation
    | GenericTypeAnnotation
    | ObjectTypeProperty
    | BooleanTypeAnnotation;

  type JSX =
    | TSESTree.JSXAttribute
    | TSESTree.JSXChild
    | TSESTree.JSXClosingElement
    | TSESTree.JSXClosingFragment
    | TSESTree.JSXElement
    | TSESTree.JSXEmptyExpression
    | TSESTree.JSXExpression
    | TSESTree.JSXEmptyExpression
    | TSESTree.JSXExpressionContainer
    | TSESTree.JSXFragment
    | TSESTree.JSXIdentifier
    | TSESTree.JSXIdentifierToken
    | TSESTree.JSXMemberExpression
    | TSESTree.JSXNamespacedName
    | TSESTree.JSXOpeningElement
    | TSESTree.JSXOpeningFragment
    | TSESTree.JSXSpreadAttribute
    | TSESTree.JSXSpreadChild
    | TSESTree.JSXTagNameExpression
    | JSXText
    | TSESTree.JSXTextToken;

  type NodeParentExtension = eslint.Rule.NodeParentExtension;

  type ASTNode = (TSESTree.Node | Node | eslint.AST.Token | BabelTypes) & { parent?: ASTNode };

  type Context = eslint.Rule.RuleContext;

  type TypeDeclarationBuilder = (annotation: ASTNode, parentName: string, seen: Set<typeof annotation>) => object;

  type TypeDeclarationBuilders = {
    [k in string]: TypeDeclarationBuilder;
  };

  type UnionTypeDefinition = {
    type: 'union' | 'shape';
    children: unknown[];
  };
}
