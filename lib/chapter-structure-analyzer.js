function cleanText(value) {
  return String(value || '').replace(/^\s*#+\s*/gm, '').replace(/\s+/g, ' ').trim()
}

function asChapters(input) {
  if (Array.isArray(input)) return input.map((item, index) => ({
    title: cleanText(item && item.title) || `第${index + 1}章`,
    content: cleanText(item && (item.content || item.text || item.title))
  }))
  const text = cleanText(input)
  if (!text) return []
  const parts = text.split(/(?=第[0-9一二三四五六七八九十百千万零两]+[章节回卷集部篇])/).filter(Boolean)
  return (parts.length ? parts : [text]).map((content, index) => ({
    title: (content.match(/^(第[^\s：:]+[章节回卷集部篇][^\n：:]*)/) || [])[1] || `第${index + 1}章`,
    content
  }))
}

export function analyzeChapterStructure(chaptersContent) {
  const chapters = asChapters(chaptersContent)
  const mainPlot = chapters.map(chapter => chapter.content || chapter.title).filter(Boolean)
  const conflictPattern = /(冲突|对立|敌|仇|危机|追杀|阻止|反抗|背叛|争夺|战争|战斗|威胁|困境|秘密)/
  const conflict = chapters
    .map(chapter => chapter.content || chapter.title)
    .filter(text => conflictPattern.test(text))
    .map(text => text.slice(0, 160))
  const eventChain = []
  for (let index = 1; index < chapters.length; index += 1) {
    const from = chapters[index - 1].content || chapters[index - 1].title
    const to = chapters[index].content || chapters[index].title
    eventChain.push({
      from: from.slice(0, 120),
      to: to.slice(0, 120),
      description: `前一章节的事件推动了后一章节的发展：${from.slice(0, 60)} → ${to.slice(0, 60)}`
    })
  }
  return { mainPlot, conflict, eventChain }
}
