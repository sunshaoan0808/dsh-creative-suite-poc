// story-parser.js
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

export async function parseStoryProject(projectPath) {
  const chaptersDir = join(projectPath, 'chapters')
  let entries
  try {
    entries = await readdir(chaptersDir, { withFileTypes: true })
  } catch (e) {
    return []
  }
  const files = []
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entry.name)
    }
  }
  files.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const structure = []
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i]
    const filePath = join(chaptersDir, fileName)
    let content = ''
    try {
      content = await readFile(filePath, 'utf8')
    } catch (e) {
      content = ''
    }
    let title = fileName.replace(/\.md$/, '')
    const lines = content.split('\n')
    for (const line of lines) {
      const m = line.match(/^\s*#{1,6}\s+(.+?)\s*$/)
      if (m) { title = m[1].trim(); break }
    }
    const id = fileName.replace(/\.md$/, '')
    const order = i
    const contentPath = relative(projectPath, filePath)
    structure.push({ id, title, order, contentPath })
  }
  return structure
}
