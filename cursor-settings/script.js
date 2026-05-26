document.addEventListener('DOMContentLoaded', () => {
    const cursorTypes = document.querySelectorAll('.cursor-type');
    const statusLabel = document.getElementById('status-label');
    const confirmBtn = document.getElementById('confirm-btn');
    const appliedStatus = document.getElementById('applied-status');
    const setSelect = document.getElementById('cursor-set-select');

    cursorTypes.forEach(btn => {
        btn.addEventListener('mouseover', () => {
            statusLabel.textContent = btn.dataset.type.charAt(0).toUpperCase() + btn.dataset.type.slice(1);
        });

        btn.addEventListener('click', () => {
            cursorTypes.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.body.style.cursor = btn.dataset.type === 'normal' ? 'default' : btn.dataset.type;
        });
    });

    confirmBtn.addEventListener('click', () => {
        const selectedSet = setSelect.options[setSelect.selectedIndex].text;
        appliedStatus.textContent = `Applied: ${selectedSet}`;
    });
});
