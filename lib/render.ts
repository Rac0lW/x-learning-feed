import DOMPurify from 'dompurify';
import { marked } from 'marked';
export function clean(html: string): string {
  const safe = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','p','br','hr','strong','em','del','blockquote','ul','ol','li','pre','code','a','img','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR: ['href','src','alt','class'],
  });
  const template = document.createElement('template');
  template.innerHTML = safe;
  template.content.querySelectorAll('img').forEach(img => {
    if (!/^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(img.getAttribute('src') ?? '')) img.remove();
  });
  template.content.querySelectorAll('a').forEach(a => {
    if (!/^https?:\/\//i.test(a.getAttribute('href') ?? '')) a.removeAttribute('href');
    a.target = '_blank'; a.rel = 'noopener noreferrer';
  });
  return template.innerHTML;
}
export function render(content: string, markdown: boolean): string {
  return clean(markdown ? marked.parse(content, { async: false }) : content);
}
