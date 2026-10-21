import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMessage } from '../electron/data/normalize'

const preview = (content: unknown, type = 49, sessionId = 'friend') => normalizeMessage({ message_content: content, local_type: type }, sessionId, 'self').content
const card = (type: number, title = '', extra = '') => `<msg><appmsg appid=""><title><![CDATA[${title}]]></title><type>${type}</type>${extra}</appmsg></msg>`

test('拍一拍识别 64 位组合类型，缺少 XML 子类型时仍显示原文', () => {
  const title = '小明拍了拍我的肩膀'
  assert.equal(preview(card(62, title)), title)
  assert.equal(preview(`<msg><appmsg><title>${title}</title></appmsg></msg>`, 266287972401), title)
  assert.equal(preview(title, 266287972401), title)
  assert.equal(preview('', 266287972401), '[拍一拍]')
})

test('系统拍一拍模板替换名字，缺失名字时不会显示占位符', () => {
  const content = '<sysmsg type="pat"><pat><template><![CDATA[${fromusername}拍了拍${pattedusername}]]></template><fromusername><![CDATA[小明]]></fromusername><pattedusername><![CDATA[我]]></pattedusername></pat></sysmsg>'
  assert.equal(preview(content, 10000), '小明拍了拍我')
  assert.equal(preview(content, 10002), '小明拍了拍我')
  assert.equal(preview(content.replace('<pattedusername><![CDATA[我]]></pattedusername>', ''), 10000), '[拍一拍]')
})

test('公众号文章通过来源账号、文章域名、会话和图文列表识别', () => {
  assert.equal(preview(card(5, '今日文章', '<sourceusername>gh_example</sourceusername>')), '[公众号文章] 今日文章')
  assert.equal(preview(card(5, '今日文章', '<url>https://mp.weixin.qq.com/s?id=1&amp;x=2</url>')), '[公众号文章] 今日文章')
  assert.equal(preview(card(49, '今日文章'), 49, 'gh_example'), '[公众号文章] 今日文章')
  assert.equal(preview(card(5, '', '<mmreader><category><item><title>头条文章</title></item></category></mmreader>')), '[公众号文章] 头条文章')
  assert.equal(preview(card(5, '普通链接', '<url>https://mp.weixin.qq.com.example.org/s/1</url>')), '[链接] 普通链接')
  assert.equal(preview(card(6, '资料.pdf'), 49, 'gh_example'), '[文件] 资料.pdf')
})

test('扩展类型按 XML 或 64 位子类型区分，空内容保留准确标签', () => {
  const cases: [number, string][] = [[3, '音乐'], [4, '视频'], [5, '链接'], [6, '文件'], [8, '文件'], [19, '聊天记录'], [24, '笔记'], [33, '小程序'], [36, '小程序'], [49, '链接'], [51, '视频号'], [53, '接龙'], [57, '引用'], [87, '群公告'], [2000, '转账'], [2001, '红包']]
  for (const [type, label] of cases) {
    assert.equal(preview(card(type, '内容')), `[${label}] 内容`, `XML type ${type}`)
    assert.equal(preview('<msg><appmsg><title>内容</title></appmsg></msg>', type * 0x100000000 + 49), `[${label}] 内容`, `local_type ${type}`)
    assert.equal(preview('', type * 0x100000000 + 49), `[${label}]`, `empty ${type}`)
  }
})

test('引用和聊天记录中的内层 type/title 不覆盖外层卡片', () => {
  const nested = '<refermsg><type>3</type><title>被引用的图片</title><content>历史内容</content></refermsg>'
  assert.equal(preview(`<appmsg>${nested}<type>57</type><title>这是回复</title></appmsg>`), '[引用] 这是回复')
  assert.equal(preview(`<appmsg>${nested}<type>57</type></appmsg>`), '[引用]')
  assert.equal(preview(card(57, '回复拍一拍', '<refermsg><patmsg><title>小明拍了拍我</title></patmsg></refermsg>')), '[引用] 回复拍一拍')
  assert.equal(preview(card(57, '回复文章', '<refermsg><mmreader><title>旧文章</title></mmreader></refermsg>')), '[引用] 回复文章')
  assert.equal(preview(card(19, '聊天记录', '<recorditem><![CDATA[<title>内部文件</title><type>6</type>]]></recorditem>')), '[聊天记录] 聊天记录')
})

test('标题正确处理 CDATA、XML 实体、大小写、群发送者前缀和 Buffer', () => {
  assert.equal(preview(card(5, '标题 &amp; &#x1f600; &#20013; &lt;参数&gt;')), '[链接] 标题 & 😀 中 <参数>')
  assert.equal(preview('friend:\r\n<MSG><APPMSG><TITLE>标题 &quot;引号&quot;</TITLE><TYPE>6</TYPE></APPMSG></MSG>'), '[文件] 标题 "引号"')
  assert.equal(preview(Buffer.from(card(36, '小程序标题'))), '[小程序] 小程序标题')
  assert.equal(preview(card(5, '标题').replace(/</g, '&lt;').replace(/>/g, '&gt;')), '[链接] 标题')
  assert.equal(preview(card(5, '<b>标题</b>')), '[链接] 标题')
})

test('公告、撤回和普通系统消息保留可读内容', () => {
  assert.equal(preview(card(87, '', '<textannouncement><![CDATA[明天开会]]></textannouncement>')), '[群公告] 明天开会')
  assert.equal(preview('<sysmsg type="revokemsg"><revokemsg><replacemsg><![CDATA[小明撤回了一条消息]]></replacemsg><newmsgid>12345</newmsgid></revokemsg></sysmsg>', 10002), '小明撤回了一条消息')
  assert.equal(preview('小明加入了群聊', 10000), '小明加入了群聊')
  assert.equal(preview('<sysmsg><sysmsgtemplate><content_template><plain><![CDATA[小明修改了群名]]></plain></content_template></sysmsgtemplate></sysmsg>', 10000), '小明修改了群名')
})

test('未知、损坏和缺失标题的卡片有可读回退，不泄漏 XML', () => {
  assert.equal(preview(card(999, '新卡片')), '[消息] 新卡片')
  assert.equal(preview('<appmsg><type>6</type><title>未结束'), '[文件] 未结束')
  assert.equal(preview(card(6, '', '<filename>资料.zip</filename>')), '[文件] 资料.zip')
  assert.equal(preview('<msg><appmsg>'), '[消息]')
  assert.equal(preview(card(5, 'x'.repeat(1000))).length, 305)
})

test('普通文本和已有媒体通知不变', () => {
  const text = 'friend:\n原文 <title>不是卡片</title> &amp; 1234567890'
  assert.equal(preview(text, 1), text.slice('friend:\n'.length))
  for (const [type, label] of [[3, '图片'], [34, '语音'], [42, '名片'], [43, '视频'], [47, '表情'], [48, '位置'], [50, '通话']] as const) {
    assert.equal(preview('<msg>原始内容</msg>', type), `[${label}]`)
  }
})
