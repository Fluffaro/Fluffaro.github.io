// <image-slot id="name"> shows images/<name>.jpg, cropped to fill its box.
// If the file doesn't exist yet, a neutral placeholder is shown instead.
if (!customElements.get('image-slot')) customElements.define('image-slot', class extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.style.display = 'block'; this.style.width = '100%'; this.style.height = '100%';
    const ph = document.createElement('div');
    ph.style.cssText = 'width:100%;height:100%;display:grid;place-items:center;font-size:28px;color:var(--color-neutral-600)';
    ph.innerHTML = '<i class="ph ph-image"></i>';
    this.appendChild(ph);
    const img = new Image();
    img.alt = this.getAttribute('alt') || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    img.onload = () => ph.replaceWith(img);
    img.src = this.getAttribute('src') || 'images/' + this.id + '.jpg';
  }
});
