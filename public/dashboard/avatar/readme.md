        <div class="avatar-container">
            <div id="aiAvatar" class="ai-avatar">
                <!-- Head -->
                <div class="avatar-head">
                    <!-- Eyes -->
                    <div class="eye left-eye"></div>
                    <div class="eye right-eye"></div>
                    <!-- Mouth -->
                    <div class="mouth"></div>
                    <!-- Side connector -->
                    <div class="connector"></div>
                </div>
                <!-- Body -->
                <div class="avatar-body">
                </div>
            </div>
        </div>

<script src="avatar.js"></script>

    <script>
        // Initialize the avatar
        const avatar = new AIAvatar('aiAvatar');
    </script>


        <div class="controls">
            <button onclick="avatar.setIdle()">Idle</button>
            <button onclick="avatar.startTalking()">Start Talking</button>
            <button onclick="avatar.stopTalking()">Stop Talking</button>
        </div>
