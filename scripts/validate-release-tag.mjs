import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
)
const version = packageJson.version
const tag = process.argv.slice(2).find((argument) => argument !== '--') ?? process.env.GITHUB_REF_NAME
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

if (typeof version !== 'string' || !semverPattern.test(version)) {
  console.error('package.json contains an invalid release version')
  process.exitCode = 1
} else if (typeof tag !== 'string' || tag.length === 0) {
  console.error('A release tag is required')
  process.exitCode = 1
} else if (tag !== `v${version}`) {
  console.error(`Release tag must equal v${version}`)
  process.exitCode = 1
} else {
  console.log(`Validated release tag ${tag}`)
}
