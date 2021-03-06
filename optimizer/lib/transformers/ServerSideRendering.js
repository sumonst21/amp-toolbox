/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const {isRenderDelayingExtension, isCustomElement} = require('../Extensions.js');
const {applyLayout} = require('./ApplyLayout.js');

class ServerSideRendering {
  // Determines whether the node |n| has an enclosing ancestor tag
  // identified as |tagname|.
  _hasAncestorWithTag(n, tagname) {
    for (let p = n.parent; p !== null; p = p.parent) {
      if (p.tagName === tagname) {
        return true;
      }
    }
    return false;
  }

  transform(tree) {
    const html = tree.root.firstChildByTag('html');
    const body = html.firstChildByTag('body');
    const head = html.firstChildByTag('head');

    // A simple check ensuring that the Server-side rendering is only applied once.
    if (typeof (html.attribs['i-amphtml-layout']) !== 'undefined' &&
      html.attribs['i-amphtml-layout'] !== null) {
      return;
    }
    html.attribs['i-amphtml-layout'] = '';

    // Within the loop we apply the layout to the custom tags (amp-foo...)
    // where possible, but while we're at this we also look for reasons
    // not to remove the boilerplate.
    let canRemoveBoilerplate = true;
    for (let node = body; node !== null; node = node.nextNode()) {
      // Skip tags that are not AMP custom elements.
      if (!isCustomElement(node)) {
        continue;
      }

      // Skip tags inside a template tag.
      if (this._hasAncestorWithTag(node, 'template')) {
        continue;
      }

      // If these attributes are used on any AMP custom element tags within
      // the document, we can't remove the boilerplate - they require the
      // boilerplate.
      if (node.attribs.heights || node.attribs.media || node.attribs.sizes) {
        canRemoveBoilerplate = false;
      }

      // amp-experiment is a render delaying extension iff the tag is used in
      // the doc. We check for that here rather than checking for the existence
      // of the amp-experiment script in IsRenderDelayingExtension below.
      if (node.tagName === 'amp-experiment') {
        canRemoveBoilerplate = false;
      }

      // amp-audio requires knowing the dimensions of the browser. Do not
      // remove the boilerplate or apply layout if amp-audio is present in the
      // document.
      if (node.tagName === 'amp-audio') {
        canRemoveBoilerplate = false;
        continue;
      }

      // Now apply the layout to the custom elements. If we encounter
      // any unsupported layout, the applyLayout function returns
      // false and we can't remove the boilerplate.
      if (!applyLayout(node, tree)) {
        canRemoveBoilerplate = false;
        continue;
      }
    }

    // Emit the amp-runtime marker to indicate that we're applying
    // server side rendering in the document.
    const ampRuntimeMarker = tree.createElement('style');
    ampRuntimeMarker.attribs['amp-runtime'] = '';

    const referenceNode = head.children && head.children.length ? head.children[0] : null;
    head.insertBefore(ampRuntimeMarker, referenceNode);

    for (let node = head.firstChild; node; node = node.nextSibling) {
      // amp-experiment is a render delaying extension iff the tag is used in
      // the doc, which we checked for above.
      if (node.tagName === 'script' && node.hasAttribute('custom-element') &&
          node.attribs['custom-element'] === 'amp-experiment') {
        continue;
      }
      if (isRenderDelayingExtension(node)) {
        canRemoveBoilerplate = false;
      }
    }

    // Below, we're only concerned about removing the boilerplate.
    // If we've already determined that we can't, we're done here.
    if (!canRemoveBoilerplate) {
      return;
    }

    // The boilerplate can be removed, note it on the <html> tag.
    html.attribs['i-amphtml-no-boilerplate'] = '';

    // Find the boilerplate and remove it.
    // The following code assumes that the <noscript>
    // tag in the head is only ever used for boilerplate.
    const toRemove = [];
    for (let node = head.firstChild; node; node = node.nextSibling) {
      if (node.tagName === 'noscript' ||
          (node.tagName === 'style' && node.hasAttribute('amp-boilerplate'))) {
        toRemove.push(node);
      }
    }

    for (let n of toRemove) {
      n.remove();
    }
  }
}

module.exports = new ServerSideRendering();
