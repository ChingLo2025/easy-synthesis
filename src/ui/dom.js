// 極小的 DOM 建構工具。沒有框架，但也不要到處寫 createElement。
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  applyProps(node, props)
  append(node, children)
  return node
}

export function applyProps(node, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value)
    else if (key === 'html') node.innerHTML = value
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (key in node && key !== 'list') {
      node[key] = value
    } else {
      node.setAttribute(key, value === true ? '' : value)
    }
  }
}

export function append(node, children) {
  const list = Array.isArray(children) ? children : [children]
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove()
  return node
}

export function replaceChildren(node, children) {
  clear(node)
  append(node, children)
  return node
}

export function svg(tag, props = {}, children = []) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue
    node.setAttribute(key, value === true ? '' : value)
  }
  append(node, children)
  return node
}

/** 事件委派：容器上掛一次，靠 data 屬性分派 */
export function delegate(root, eventName, selector, handler) {
  root.addEventListener(eventName, (event) => {
    const target = event.target.closest(selector)
    if (target && root.contains(target)) handler(event, target)
  })
}

export function debounce(fn, ms) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
