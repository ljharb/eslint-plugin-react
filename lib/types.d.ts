import eslint from 'eslint';
import type { Node } from "estree";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

declare global {
  type ASTNode = Node | TSESTree.Node;

  type Scope = eslint.Scope.Scope;
  type Token = eslint.AST.Token;
  type Fixer = eslint.Rule.RuleFixer;
  type ArrowFunctionExpression = TSESTree.ArrowFunctionExpression;
  type CallExpression = TSESTree.CallExpression;
  type CallExpressionArgument = TSESTree.CallExpression['arguments'][0];
  type ClassDeclaration = TSESTree.ClassDeclaration;
  type ClassExpression = TSESTree.ClassExpression;
  type FunctionDeclaration = TSESTree.FunctionDeclaration;
  type FunctionExpression = TSESTree.FunctionExpression;
  type Expression = TSESTree.Expression;
  type ExpressionStatement = TSESTree.ExpressionStatement;
  type ImportDeclaration = TSESTree.ImportDeclaration;
  type ImportDefaultSpecifier = TSESTree.ImportDefaultSpecifier;
  type ImportSpecifier = TSESTree.ImportSpecifier;
  type JSXAttribute = TSESTree.JSXAttribute;
  type JSXChild = TSESTree.JSXChild;
  type JSXElement = TSESTree.JSXElement;
  type JSXExpressionContainer = TSESTree.JSXExpressionContainer;
  type JSXFragment = TSESTree.JSXFragment;
  type JSXIdentifier = TSESTree.JSXIdentifier;
  type JSXOpeningElement = TSESTree.JSXOpeningElement;
  type JSXOpeningFragment = TSESTree.JSXOpeningFragment;
  type JSXSpreadAttribute = TSESTree.JSXSpreadAttribute;
  type JSXText = TSESTree.JSXText;
  type Literal = TSESTree.Literal;
  type MemberExpression = TSESTree.MemberExpression;
  type MethodDefinition = TSESTree.MethodDefinition;
  type ObjectExpression = TSESTree.ObjectExpression;
  type ObjectPattern = TSESTree.ObjectPattern;
  type Property = TSESTree.Property;
  type ReturnStatement = TSESTree.ReturnStatement;
  type ThisExpression = TSESTree.ThisExpression;
  type TSInterfaceDeclaration = TSESTree.TSInterfaceDeclaration;
  type TSTypeAliasDeclaration = TSESTree.TSTypeAliasDeclaration;
  type VariableDeclarator = TSESTree.VariableDeclarator;
  type PropertyDefinitionNode = TSESTree.PropertyDefinition;
  type JSXClosingElement = TSESTree.JSXClosingElement;
  type JSXClosingFragment = TSESTree.JSXClosingFragment;
  type ClassElement = TSESTree.ClassElement;
  type ObjectLiteralElement = TSESTree.ObjectLiteralElement;
  type MemberExpressionComputedName = TSESTree.MemberExpressionComputedName;
  type MemberExpressionNonComputedName = TSESTree.MemberExpressionNonComputedName;
  type TSTypeReference = TSESTree.TSTypeReference;
  type TSTypeAnnotation = TSESTree.TSTypeAnnotation;
  type TSTypeLiteral = TSESTree.TSTypeLiteral;
  type TSIntersectionType = TSESTree.TSIntersectionType;
  type TSInterfaceHeritage = TSESTree.TSInterfaceHeritage;
  type ExportNamedDeclaration = TSESTree.ExportNamedDeclaration;
  type VariableDeclaration = TSESTree.VariableDeclaration;
  type TSAsExpression = TSESTree.TSAsExpression;
  type EntityName = TSESTree.EntityName;
  type Parameter = TSESTree.Parameter;
  type Statement = TSESTree.Statement;
  type Identifier = TSESTree.Identifier;
  type RestElement = TSESTree.RestElement;
  type ImportBinding = unknown; // TODO
  type ClassProperty = ASTNode; // TODO
  type TypeAlias = unknown; // TODO
  type TSQualifiedName = TSESTree.TSQualifiedName;

  type JSX =
    | TSESTree.JSXAttribute
    | TSESTree.JSXChild
    | TSESTree.JSXClosingElement
    | TSESTree.JSXClosingFragment
    | TSESTree.JSXElement
    | TSESTree.JSXEmptyExpression
    | TSESTree.JSXExpression
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
