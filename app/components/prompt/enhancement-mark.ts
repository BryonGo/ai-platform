// TipTap 提示词扩展：snippet（超级标签）原子节点 + enhancement（润色高亮）标记，
// 以及 Prompt <-> ProseMirror 文档的序列化。
// 忠实移植 PeachArt apps/web/src/components/prompt/enhancement-mark.ts。
import { Mark, Node, Extension } from '@tiptap/core'
import CharacterCount from '@tiptap/extension-character-count'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { history, undo, redo } from '@tiptap/pm/history'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export const enhancementMarkName = 'enhancement'
export const snippetNodeName = 'snippet'

// Prompt 结构化数据（对齐 PeachArt Prompt = { parts: (text|enhancement|snippet)[] }）。
export type SnippetSnapshot = {
  id: string
  category: { key: string, labels: { chinese: string, english: string } }
  labels: { chinese: string, english: string }
  prompt: { chinese: string, english: string }
  preview: string | null
}

export type PromptPart
  = | { kind: 'text', text: string }
    | { kind: 'enhancement', id: string, text: string, note: string | null }
    | { kind: 'snippet', id: string, source: SnippetSnapshot }

export type Prompt = { parts: PromptPart[] }

// snippet 分类中文标签兜底（对齐 PeachArt snippetLabels）。
const snippetLabels: Record<string, string> = {
  character: '角色',
  clothing: '服装',
  background: '背景',
  pose: '姿势',
  style: '画风'
}

const PromptDocument = Node.create({ name: 'doc', topNode: true, content: 'paragraph' })

const EnhancementMark = Mark.create({
  name: enhancementMarkName,
  inclusive: false,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-enhancement-id') },
      note: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('data-enhancement-note') }
    }
  },
  parseHTML() {
    return [{ tag: 'mark[data-enhancement-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const note = typeof HTMLAttributes.note === 'string' ? HTMLAttributes.note.trim() : ''
    return [
      'span',
      {
        'data-enhancement-id': HTMLAttributes.id,
        'data-enhancement-note': note || undefined,
        'data-enhancement-pending': note ? undefined : 'true',
        'title': note || undefined,
        'class': 'enhancement'
      },
      0
    ]
  }
})

const SnippetNode = Node.create({
  name: snippetNodeName,
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { id: { default: null }, source: { default: null }, pendingCategory: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span.super-tag[data-snippet-id]' }]
  },
  renderHTML({ node }) {
    const source = node.attrs.source as SnippetSnapshot | null
    const pendingCategory = node.attrs.pendingCategory as string | null
    const category = source?.category.key ?? pendingCategory
    if (!category) return ['span', { 'data-snippet-id': node.attrs.id }]
    const categoryLabel = source?.category.labels.chinese ?? snippetLabels[category]
    const name = source?.labels.chinese ?? '待选择'
    const attributes = {
      'class': `super-tag is-${category}`,
      'data-snippet-id': node.attrs.id,
      'data-snippet-pending': source ? undefined : 'true',
      'contenteditable': 'false',
      'tabindex': '0',
      'role': 'button',
      'aria-label': `${categoryLabel} ${name}`
    }
    const categoryNode = ['span', { class: 'super-tag__category', contenteditable: 'false' }, ['b', { contenteditable: 'false' }, categoryLabel]]
    const nameNode = ['span', { class: 'super-tag__name line-clamp-1', contenteditable: 'false' }, name]
    if (!source) return ['span', attributes, categoryNode, nameNode]
    return [
      'span',
      attributes,
      categoryNode,
      nameNode,
      ['span', { class: 'super-tag__prompt line-clamp-1', contenteditable: 'false' }, source.prompt.english]
    ]
  }
})

// Enter / Shift-Enter 都产生软换行（不产生新段落）。
const PromptHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    return {
      'Enter': () => this.editor.commands.setHardBreak(),
      'Shift-Enter': () => this.editor.commands.setHardBreak()
    }
  }
})

// history 插件挂在文档上，使标签的插入/替换/删除像普通文本编辑一样可撤销。
const PromptHistory = Extension.create({
  name: 'promptHistory',
  addProseMirrorPlugins() {
    return [history()]
  },
  addKeyboardShortcuts() {
    return {
      'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
      'Mod-Shift-z': () => redo(this.editor.state, this.editor.view.dispatch),
      'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch)
    }
  }
})

export const maxPromptLength = 2000

export function promptExtensions() {
  return [
    PromptDocument,
    Paragraph,
    Text,
    PromptHardBreak,
    EnhancementMark,
    SnippetNode,
    PromptHistory,
    CharacterCount.configure({ limit: maxPromptLength })
  ]
}

export function serializePrompt(doc: ProseMirrorNode): Prompt {
  const paragraph = doc.firstChild
  if (!paragraph) return { parts: [] }
  const parts: PromptPart[] = []
  paragraph.forEach((child: ProseMirrorNode) => {
    if (child.type.name === snippetNodeName) {
      const source = child.attrs.source as SnippetSnapshot | null
      if (source) parts.push({ kind: 'snippet', id: child.attrs.id as string, source })
      return
    }
    const text = child.type.name === 'hardBreak' ? '\n' : (child.text ?? '')
    if (!text) return
    const mark = child.marks.find(candidate => candidate.type.name === enhancementMarkName)
    if (!mark?.attrs.id) {
      appendText(parts, text)
      return
    }
    const previous = parts[parts.length - 1]
    if (previous?.kind === 'enhancement' && previous.id === mark.attrs.id) {
      previous.text += text
    } else {
      parts.push({ kind: 'enhancement', id: mark.attrs.id as string, text, note: (mark.attrs.note as string | null) ?? null })
    }
  })
  return { parts }
}

export function promptToDocument(prompt: Prompt): Record<string, unknown> {
  const content: Record<string, unknown>[] = []
  for (const part of prompt.parts) {
    if (part.kind === 'snippet') {
      content.push({ type: snippetNodeName, attrs: { id: part.id, source: part.source } })
      continue
    }
    pushText(content, part.text, part.kind === 'enhancement' ? part : null)
  }
  return { type: 'doc', content: [{ type: 'paragraph', content: content.length ? content : undefined }] }
}

// 喂给后端的纯文本：snippet 取英文 prompt，普通文本原样（对齐 PeachArt promptText）。
export function promptText(prompt: Prompt): string {
  return prompt.parts
    .map((part) => {
      if (part.kind === 'snippet') return part.source.prompt.english
      if (part.kind === 'enhancement') return part.text
      return part.text
    })
    .join('')
    .replace(/\n/g, ', ')
}

function appendText(parts: PromptPart[], text: string) {
  const previous = parts[parts.length - 1]
  if (previous?.kind === 'text') previous.text += text
  else parts.push({ kind: 'text', text })
}

function pushText(content: Record<string, unknown>[], chunk: string, enhancement: { kind: 'enhancement', id: string, text: string, note: string | null } | null) {
  const marks = enhancement
    ? [{ type: enhancementMarkName, attrs: { id: enhancement.id, note: enhancement.note } }]
    : undefined
  for (const [index, piece] of chunk.split('\n').entries()) {
    if (index > 0) content.push({ type: 'hardBreak', marks })
    if (piece) content.push({ type: 'text', text: piece, marks })
  }
}
