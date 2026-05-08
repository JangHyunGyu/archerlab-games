(function() {
    var userAgent = navigator.userAgent || "";
    var isKakao = /KAKAOTALK/i.test(userAgent);
    var isLine = /Line\//i.test(userAgent);
    var isFacebook = /FBAN|FBAV/i.test(userAgent);
    var isInApp = isKakao || isLine || isFacebook;

    var isAndroid = /Android/i.test(userAgent);
    var isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    var isWindows = /Windows/i.test(userAgent) || /Win32|Win64/i.test(navigator.platform);
    var isMac = /Macintosh/i.test(userAgent) || /MacIntel/i.test(navigator.platform);

    // PC 브라우저에서는 무시
    if (isWindows || isMac) return;

    if (isInApp) {
        window.__CAT_TOWER_EXTERNAL_BROWSER_REQUIRED = true;

        if (isAndroid) {
            // Android: Chrome으로 강제 이동 (intent 방식)
            var url = location.href.replace(/https?:\/\//i, '');
            location.href = 'intent://' + url + '#Intent;scheme=https;package=com.android.chrome;end';

            setTimeout(function() {
                document.body.style.backgroundColor = '#0a0a1a';
                document.body.innerHTML = '';

                var container = document.createElement('div');
                container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:white;padding:20px;box-sizing:border-box;';

                var icon = document.createElement('div');
                icon.innerHTML = '🚀';
                icon.style.fontSize = '48px';
                icon.style.marginBottom = '20px';

                var text = document.createElement('p');
                text.innerHTML = '<b>Chrome 브라우저</b>에서 열어주세요.<br><br>자동으로 이동되지 않는 경우<br>우측 상단 메뉴(⋮)에서<br><b>[다른 브라우저로 열기]</b>를 선택해주세요.<br><br><span style="font-size:14px;color:#aaa;">이 창은 닫으셔도 됩니다.</span>';
                text.style.lineHeight = '1.6';

                container.appendChild(icon);
                container.appendChild(text);
                document.body.appendChild(container);
            }, 300);

        } else if (isIOS) {
            // iOS: Safari로 안내
            document.addEventListener('DOMContentLoaded', function() {
                document.body.style.backgroundColor = '#0a0a1a';
                document.body.innerHTML = '';

                var overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0a1a;z-index:9999;display:flex;flex-direction:column;justify-content:center;align-items:center;color:white;text-align:center;font-size:18px;padding:30px;box-sizing:border-box;';

                var icon = document.createElement('div');
                icon.innerHTML = '🧭';
                icon.style.fontSize = '48px';
                icon.style.marginBottom = '20px';

                var message = document.createElement('p');
                message.innerHTML = '이 게임은 <b>Safari 브라우저</b>에서<br>정상적으로 작동합니다.<br><br>우측 하단 <b>[ ⎋ ]</b> 버튼 또는<br>하단의 <b>[ 공유(↑) ]</b> 버튼을 누르고<br><b>"Safari로 열기"</b>를 선택해주세요.';
                message.style.lineHeight = '1.8';
                message.style.marginBottom = '30px';

                var arrow = document.createElement('div');
                arrow.innerHTML = '↗';
                arrow.style.cssText = 'font-size:50px;position:absolute;bottom:30px;right:30px;animation:bounce 1s infinite;';

                var style = document.createElement('style');
                style.innerHTML = '@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }';
                document.head.appendChild(style);

                overlay.appendChild(icon);
                overlay.appendChild(message);
                overlay.appendChild(arrow);
                document.body.appendChild(overlay);
            });
        }
    }
})();
