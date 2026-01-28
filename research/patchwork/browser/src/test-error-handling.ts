import { compileWidget } from './compiler.js';
import { syntaxErrorWidget, typeErrorWidget } from './sample-widgets.js';

async function runErrorTests() {
  console.log('🧪 Patchwork Browser Runtime - Error Handling Tests\n');
  console.log('='.repeat(60));

  const errorTests = [
    {
      name: 'Syntax Error (missing parenthesis)',
      source: syntaxErrorWidget,
      expectedError: true,
    },
    {
      name: 'Type Error (wrong type in useState)',
      source: typeErrorWidget,
      expectedError: false,
    },
    {
      name: 'Empty Source',
      source: '',
      expectedError: false,
    },
    {
      name: 'Invalid JSX',
      source: `
        export function Broken() {
          return (
            <div>
              <span>Unclosed span
            </div>
          );
        }
      `,
      expectedError: true,
    },
    {
      name: 'Missing Import',
      source: `
        export function NoImport() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `,
      expectedError: false,
    },
    {
      name: 'Invalid TypeScript',
      source: `
        const x: number = "string";
        export const Component = () => <div>{x}</div>;
      `,
      expectedError: false,
    },
  ];

  console.log('\n📊 Error Handling Tests:\n');

  for (const test of errorTests) {
    console.log(`   Testing: ${test.name}`);

    const result = await compileWidget(test.source);
    const hasErrors = result.errors && result.errors.length > 0 && !result.code;

    if (hasErrors) {
      console.log(
        `   Status: ❌ Compilation failed (expected: ${
          test.expectedError ? 'yes' : 'no'
        })`,
      );
      console.log(`   Error: ${result.errors?.[0]?.slice(0, 100)}...`);
      console.log(
        `   Result: ${
          hasErrors === test.expectedError ? '✅ PASS' : '⚠️  UNEXPECTED'
        }\n`,
      );
    } else {
      console.log(
        `   Status: ✅ Compilation succeeded (expected: ${
          test.expectedError ? 'no' : 'yes'
        })`,
      );
      console.log(`   Output: ${result.code.length} bytes`);
      if (result.errors && result.errors.length > 0) {
        console.log(`   Warnings: ${result.errors.length}`);
      }
      console.log(
        `   Result: ${
          hasErrors === test.expectedError ? '✅ PASS' : '⚠️  UNEXPECTED'
        }\n`,
      );
    }
  }

  console.log('='.repeat(60));
  console.log('\n📝 Note: TypeScript type errors are NOT caught by esbuild.');
  console.log(
    '   esbuild performs syntax transformation only, not type checking.',
  );
  console.log('   For type safety, run tsc separately before compilation.\n');

  console.log('✅ Error handling tests complete!\n');
}

runErrorTests().catch(console.error);
