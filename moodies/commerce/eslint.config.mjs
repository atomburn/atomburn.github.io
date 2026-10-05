import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['.next/**','public/**','next-env.d.ts']},js.configs.recommended,...ts.configs.recommended,{
  files:['**/*.mjs'],languageOptions:{globals:{console:'readonly',process:'readonly',Buffer:'readonly',URL:'readonly'}}
});
