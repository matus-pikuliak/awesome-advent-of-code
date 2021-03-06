const fs = require('fs')
const core = require('@actions/core')
const github = require('@actions/github')
const endpoint = require('./endpoint')

let octokit

try {
  const ghToken = core.getInput('ghToken')
  const inputFile = core.getInput('inputFile')
  const outputFile = core.getInput('outputFile')

  const content = fs.readFileSync(inputFile, 'utf8')
  const lines = content.split('\n')
  core.startGroup('Extract repositories')
  const repos = extractRepositories(lines)
  core.info(`count=${repos.length}`)
  core.endGroup()

  octokit = github.getOctokit(ghToken)
  core.startGroup('Fetch repositories')
  Promise.all(repos.map(({ repoStr }) => generateLine(repoStr)))
    .then((newLines) => {
      core.endGroup()

      newLines.forEach((line, i) => {
        if (shouldUpdate(lines[repos[i].index], line)) {
          lines[repos[i].index] = line
        }
      })

      core.startGroup('Writing to file')
      fs.writeFileSync(outputFile, lines.join('\n'))
      core.info(`Finished writing to ${outputFile}`)
      core.endGroup()
    })
    .catch(error => {
      core.setFailed(error.message)
    })
} catch (error) {
  core.setFailed(error.message)
}

function extractRepositories(lines) {
  const repos = []

  let collect = false
  lines.some((line, index) => {
    if (line === '### Solutions') {
      collect = true
    } else if (collect) {
      const idx1 = line.indexOf('[')
      const idx2 = line.indexOf(']')
      if (idx1 >= 0 && idx2 >= 0) {
        repos.push({
          index,
          repoStr: line.slice(idx1 + 1, idx2)
        })
      }
    }

    return false
  })

  return repos
}

async function generateLine(repoStr) {
  const badge = await generateBadge(repoStr)
  return `* [${repoStr}](https://github.com/${repoStr}) ![Last Commit on GitHub](${badge})`
}

async function generateBadge(repoStr) {
  const [owner, repo] = repoStr.split('/')
  const { label, message, color } = await endpoint(octokit, { owner, repo })

  core.info(`...fetched repo ${repoStr}`)

  return 'https://img.shields.io/badge/' + [label, message, color]
    .map(s => encodeURIComponent(s.replace(/\-/g, '--')))
    .join('-')
}

function shouldUpdate(oldLine, newLine) {
  const badDateReg = /red\)$/
  return badDateReg.test(oldLine) || !badDateReg.test(newLine)
}
