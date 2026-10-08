import { marked } from 'marked';
import sanitize from 'sanitize-html';
export function render(content: string, format: string): string {
  return sanitize(format === 'markdown' ? marked.parse(content, { async: false }) : content, {
    allowedTags: ['h1','h2','h3','h4','p','br','hr','strong','em','del','blockquote','ul','ol','li','pre','code','a','img','table','thead','tbody','tr','th','td'],
    allowedAttributes: { a: ['href'], img: ['src','alt'], code: ['class'] },
    allowedSchemes: ['https','http'], allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    exclusiveFilter: frame => frame.tag === 'img' && !/^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(frame.attribs.src ?? ''),
  });
}
