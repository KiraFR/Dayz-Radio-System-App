// Injection de la barre de titre Electron
(function() {
    // Ne pas injecter si déjà présente
    if (document.querySelector('.electron-titlebar')) return;
    
    // Créer la barre de titre
    const titlebar = document.createElement('div');
    titlebar.className = 'electron-titlebar';
    titlebar.innerHTML = `
        <div class="electron-titlebar-title">
            <span>Radio VoIP DayZ</span>
        </div>
        <div class="electron-titlebar-buttons">
            <button class="electron-titlebar-btn" id="electron-btn-minimize">&#8211;</button>
            <button class="electron-titlebar-btn" id="electron-btn-maximize">&#9633;</button>
            <button class="electron-titlebar-btn close" id="electron-btn-close">&#10005;</button>
        </div>
    `;
    
    // Insérer au début du body
    document.body.insertBefore(titlebar, document.body.firstChild);
    document.body.classList.add('has-electron-titlebar');
    
    // Event listeners
    document.getElementById('electron-btn-minimize').addEventListener('click', () => {
        if (window.electronAPI) window.electronAPI.minimize();
    });
    
    document.getElementById('electron-btn-maximize').addEventListener('click', () => {
        if (window.electronAPI) window.electronAPI.maximize();
    });
    
    document.getElementById('electron-btn-close').addEventListener('click', () => {
        if (window.electronAPI) window.electronAPI.close();
    });
})();
