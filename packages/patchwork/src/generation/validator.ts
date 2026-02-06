import * as ts from 'typescript';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  message: string;
  line?: number;
  column?: number;
}

interface ValidatorContext {
  runtime: 'browser' | 'terminal' | 'data';
  declaredPackages: Set<string>;
  errors: ValidationError[];
}

const AUTO_INCLUDED = {
  browser: new Set(['react', 'react-dom']),
  terminal: new Set(['react', 'ink']),
  data: new Set<string>(),
};

const DANGEROUS_GLOBALS = new Set([
  'process',
  'require',
  'global',
  '__dirname',
  '__filename',
  'module',
  'exports',
]);

const DANGEROUS_IDENTIFIERS = new Set([
  'eval',
  'Function',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'importScripts',
]);

const DANGEROUS_PROPERTY_ACCESS = new Set([
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'navigator.geolocation',
  'navigator.mediaDevices',
  'Notification',
]);

function addError(
  ctx: ValidatorContext,
  code: string,
  message: string,
  node?: ts.Node,
): void {
  const error: ValidationError = { code, message };
  if (node) {
    const sf = node.getSourceFile();
    const { line, character } = sf.getLineAndCharacterOfPosition(
      node.getStart(),
    );
    error.line = line + 1;
    error.column = character + 1;
  }
  ctx.errors.push(error);
}

function checkNode(node: ts.Node, ctx: ValidatorContext): void {
  if (ts.isImportDeclaration(node)) {
    const moduleSpec = node.moduleSpecifier;
    if (ts.isStringLiteral(moduleSpec)) {
      const pkg = moduleSpec.text;
      if (pkg.startsWith('.') || pkg.startsWith('/') || pkg.startsWith('@/'))
        return;
      const basePkg = pkg.startsWith('@')
        ? pkg.split('/').slice(0, 2).join('/')
        : pkg.split('/')[0];
      const allowed = AUTO_INCLUDED[ctx.runtime];
      if (!allowed.has(basePkg!) && !ctx.declaredPackages.has(basePkg!)) {
        addError(
          ctx,
          'UNDECLARED_IMPORT',
          `Package '${basePkg}' not declared in meta.packages`,
          node,
        );
      }
    }
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    addError(ctx, 'DYNAMIC_IMPORT', 'Dynamic imports are not allowed', node);
  }

  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = node.expression.text;
    if (name === 'fetch') {
      addError(
        ctx,
        'DIRECT_FETCH',
        'Direct fetch() calls not allowed. Use services instead',
        node,
      );
    }
    if (DANGEROUS_IDENTIFIERS.has(name)) {
      addError(ctx, 'DANGEROUS_CALL', `'${name}' is not allowed`, node);
    }
  }

  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    const name = node.expression.text;
    if (DANGEROUS_IDENTIFIERS.has(name)) {
      addError(
        ctx,
        'DANGEROUS_CONSTRUCTOR',
        `'new ${name}()' is not allowed`,
        node,
      );
    }
  }

  if (ts.isPropertyAccessExpression(node)) {
    const text = node.getText();
    for (const dangerous of DANGEROUS_PROPERTY_ACCESS) {
      if (text === dangerous || text.endsWith(`.${dangerous}`)) {
        addError(
          ctx,
          'DANGEROUS_API',
          `'${dangerous}' access is not allowed`,
          node,
        );
      }
    }
  }

  if (ts.isIdentifier(node)) {
    const parent = node.parent;
    const isDeclaration =
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent);

    if (!isDeclaration && DANGEROUS_GLOBALS.has(node.text)) {
      if (node.text === 'process') {
        addError(
          ctx,
          'PROCESS_ACCESS',
          "'process' global is not allowed",
          node,
        );
      } else if (node.text === 'require') {
        addError(
          ctx,
          'REQUIRE_CALL',
          "'require' is not allowed. Use ES imports",
          node,
        );
      } else {
        addError(
          ctx,
          'DANGEROUS_GLOBAL',
          `'${node.text}' global is not allowed`,
          node,
        );
      }
    }
  }

  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    const expr = node.expression;
    if (ts.isIdentifier(expr.expression) && expr.expression.text === 'fs') {
      addError(
        ctx,
        'FS_ACCESS',
        'Direct filesystem access not allowed. Use services',
        node,
      );
    }
  }

  ts.forEachChild(node, (child) => checkNode(child, ctx));
}

function extractDeclaredPackages(source: string): Set<string> {
  const packages = new Set<string>();
  const match = source.match(/packages\s*:\s*\{([^}]*)\}/);
  if (match && match[1]) {
    const pkgMatches = match[1].matchAll(/["']([^"']+)["']\s*:/g);
    for (const m of pkgMatches) {
      if (m[1]) packages.add(m[1]);
    }
  }
  return packages;
}

function extractRuntime(source: string): 'browser' | 'terminal' | 'data' {
  const match = source.match(/runtime\s*:\s*["'](browser|terminal|data)["']/);
  return (match?.[1] as 'browser' | 'terminal' | 'data') || 'browser';
}

export function validateWidgetSource(
  source: string,
  overrideRuntime?: 'browser' | 'terminal' | 'data',
): ValidationResult {
  const runtime = overrideRuntime || extractRuntime(source);
  const declaredPackages = extractDeclaredPackages(source);

  const ctx: ValidatorContext = { runtime, declaredPackages, errors: [] };

  const sourceFile = ts.createSourceFile(
    'widget.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  ts.forEachChild(sourceFile, (node) => checkNode(node, ctx));

  return { valid: ctx.errors.length === 0, errors: ctx.errors };
}

export function validateWidgetSyntax(source: string): ValidationResult {
  const sourceFile = ts.createSourceFile(
    'widget.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const errors: ValidationError[] = [];
  const diagnostics = (sourceFile as any).parseDiagnostics;
  if (diagnostics?.length) {
    for (const diag of diagnostics) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        diag.start || 0,
      );
      errors.push({
        code: 'SYNTAX_ERROR',
        message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
        line: line + 1,
        column: character + 1,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateWidget(
  source: string,
  runtime?: 'browser' | 'terminal' | 'data',
): ValidationResult {
  const syntaxResult = validateWidgetSyntax(source);
  if (!syntaxResult.valid) return syntaxResult;
  return validateWidgetSource(source, runtime);
}
