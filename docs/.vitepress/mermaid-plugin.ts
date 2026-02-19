import type MarkdownIt from 'markdown-it';

export function mermaidPlugin(md: MarkdownIt) {
  // 保存原始的 fence 规则
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules) ||
    ((tokens, idx, options, env, self) => {
      const token = tokens[idx];
      return `<pre><code class="language-${token.info}">${token.content}</code></pre>`;
    });

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info.trim();

    // 如果是 mermaid 代码块，返回自定义组件
    if (info === 'mermaid') {
      const code = token.content.trim();
      // 使用 base64 编码避免 HTML 转义问题
      const encodedCode = btoa(unescape(encodeURIComponent(code)));
      return `<Mermaid code="${encodedCode}" encoding="base64" />`;
    }

    // 其他代码块使用默认渲染
    return defaultFence(tokens, idx, options, env, self);
  };
}
