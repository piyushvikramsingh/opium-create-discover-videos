import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:opium_flutter/services/realtime_chat_service.dart';
import 'package:opium_flutter/theme/opium_theme.dart';
import 'package:opium_flutter/widgets/create_leading_button.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MessagesTabPage extends StatefulWidget {
  const MessagesTabPage({super.key});

  @override
  State<MessagesTabPage> createState() => _MessagesTabPageState();
}

class _MessagesTabPageState extends State<MessagesTabPage> {
  final RealtimeChatService _chat = RealtimeChatService.instance;
  List<ChatConversation> _conversations = const <ChatConversation>[];
  RealtimeChannel? _conversationsChannel;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  bool _onlyUnread = false;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      if (!mounted) return;
      setState(() => _searchQuery = _searchController.text.trim().toLowerCase());
    });
    _loadConversations();
    _conversationsChannel = _chat.subscribeConversations(
      onChanged: _loadConversations,
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    final channel = _conversationsChannel;
    if (channel != null) {
      _chat.disposeChannel(channel);
    }
    super.dispose();
  }

  Future<void> _loadConversations() async {
    try {
      final items = await _chat.fetchConversations();
      if (!mounted) return;
      setState(() {
        _conversations = items;
        _isLoading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const CreateLeadingButton(),
        title: const Text('Messages'),
        actions: [
          IconButton(
            tooltip: 'New chat',
            onPressed: _openNewChat,
            icon: const Icon(Icons.add_comment_outlined),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Future<void> _openNewChat() async {
    final selected = await showModalBottomSheet<ChatUser>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _NewChatSheet(chat: _chat),
    );

    if (selected == null) return;
    try {
      final conversationId = await _chat.createOrGetConversation(selected.id);
      if (!mounted) return;
      final conversation = ChatConversation(
        id: conversationId,
        otherUserId: selected.id,
        title: selected.displayName,
        username: selected.username,
        avatarUrl: selected.avatarUrl,
        lastMessage: null,
        unreadCount: 0,
      );

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _ChatThreadPage(conversation: conversation),
        ),
      );
      _loadConversations();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not start chat: $error')),
      );
    }
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Failed to load conversations'),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _loadConversations,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_conversations.isEmpty) {
      return const Center(child: Text('No conversations yet'));
    }

    final visible = _conversations.where((conversation) {
      final passesUnread = !_onlyUnread || conversation.unreadCount > 0;
      if (!passesUnread) return false;
      if (_searchQuery.isEmpty) return true;

      final title = conversation.title.toLowerCase();
      final username = conversation.username.toLowerCase();
      final last = (conversation.lastMessage?.content ?? '').toLowerCase();
      return title.contains(_searchQuery) || username.contains(_searchQuery) || last.contains(_searchQuery);
    }).toList();

    return RefreshIndicator(
      onRefresh: _loadConversations,
      child: ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search chats',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () => _searchController.clear(),
                        icon: const Icon(Icons.close),
                      ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('All'),
                  selected: !_onlyUnread,
                  onSelected: (_) => setState(() => _onlyUnread = false),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Unread'),
                  selected: _onlyUnread,
                  onSelected: (_) => setState(() => _onlyUnread = true),
                ),
              ],
            ),
          ),
          if (visible.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 60),
              child: Center(child: Text('No matching conversations')),
            )
          else
            ...List.generate(visible.length, (index) {
              final conversation = visible[index];
              final title = conversation.title.trim().isEmpty ? '@unknown' : conversation.title;
              final subtitle = (conversation.lastMessage?.content ?? '').trim();

              return Column(
                children: [
                  ListTile(
                    leading: CircleAvatar(child: Text(title[0].toUpperCase())),
                    title: Text(title),
                    subtitle: Text(
                      subtitle.isEmpty ? 'Start chatting…' : subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: conversation.unreadCount > 0
                        ? CircleAvatar(
                            radius: 11,
                            child: Text(
                              '${conversation.unreadCount}',
                              style: const TextStyle(fontSize: 12),
                            ),
                          )
                        : null,
                    onTap: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => _ChatThreadPage(conversation: conversation),
                        ),
                      );
                      _loadConversations();
                    },
                  ),
                  const Divider(height: 1),
                ],
              );
            }),
        ],
      ),
    );
  }
}

class _ChatThreadPage extends StatefulWidget {
  const _ChatThreadPage({required this.conversation});

  final ChatConversation conversation;

  @override
  State<_ChatThreadPage> createState() => _ChatThreadPageState();
}

class _ChatThreadPageState extends State<_ChatThreadPage> {
  final TextEditingController _controller = TextEditingController();
  final RealtimeChatService _chat = RealtimeChatService.instance;

  List<ChatMessage> _messages = const <ChatMessage>[];
  RealtimeChannel? _messagesChannel;
  RealtimeChannel? _callChannel;
  RealtimeChannel? _typingChannel;
  bool _isLoading = true;
  String? _error;
  bool _isPeerTyping = false;
  Timer? _typingDebounce;

  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  bool _inCall = false;
  bool _isVideoCall = false;
  bool _isIncomingCall = false;
  bool _isMuted = false;
  String _callStatus = 'idle';
  String? _activeCallId;
  Map<String, dynamic>? _incomingOffer;
  Timer? _outgoingRingTimeout;
  Timer? _incomingRingTimeout;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  @override
  void dispose() {
    final messagesChannel = _messagesChannel;
    if (messagesChannel != null) {
      _chat.disposeChannel(messagesChannel);
    }
    final callChannel = _callChannel;
    if (callChannel != null) {
      _chat.disposeChannel(callChannel);
    }
    final typingChannel = _typingChannel;
    if (typingChannel != null) {
      _chat.disposeChannel(typingChannel);
    }
    _typingDebounce?.cancel();
    unawaited(
      _chat.setTypingStatus(
        conversationId: widget.conversation.id,
        isTyping: false,
      ),
    );
    _cancelRingTimeouts();
    _endCall(notifyRemote: false);
    _localRenderer.dispose();
    _remoteRenderer.dispose();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _initialize() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();

    _messagesChannel = _chat.subscribeMessages(
      conversationId: widget.conversation.id,
      onChanged: _loadMessages,
    );

    _callChannel = _chat.subscribeCallSignals(
      conversationId: widget.conversation.id,
      onSignal: _onCallSignal,
    );

    _typingChannel = _chat.subscribeTypingStatus(
      conversationId: widget.conversation.id,
      onChanged: _refreshTypingStatus,
    );

    await _loadMessages();
    await _refreshTypingStatus();
    await _chat.markConversationRead(widget.conversation.id);
  }

  Future<void> _refreshTypingStatus() async {
    try {
      final value = await _chat.hasTypingPeer(widget.conversation.id);
      if (!mounted) return;
      setState(() => _isPeerTyping = value);
    } catch (_) {
      // Keep chat usable if typing status fails.
    }
  }

  Future<void> _loadMessages() async {
    try {
      final values = await _chat.fetchMessages(widget.conversation.id);
      if (!mounted) return;
      setState(() {
        _messages = values;
        _isLoading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    await _chat.sendTextMessage(
      conversationId: widget.conversation.id,
      text: text,
    );
    await _chat.setTypingStatus(
      conversationId: widget.conversation.id,
      isTyping: false,
    );
    _controller.clear();
  }

  void _onComposerChanged(String value) {
    _chat.setTypingStatus(
      conversationId: widget.conversation.id,
      isTyping: value.trim().isNotEmpty,
    );

    _typingDebounce?.cancel();
    _typingDebounce = Timer(const Duration(milliseconds: 1200), () {
      _chat.setTypingStatus(
        conversationId: widget.conversation.id,
        isTyping: false,
      );
    });
  }

  Future<void> _startCall({required bool video}) async {
    if (_inCall || widget.conversation.otherUserId.isEmpty) return;
    final myUserId = _chat.currentUserId;

    final granted = await _ensureCallPermissions(video: video);
    if (!granted) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Camera/Microphone permission is required for calling.')),
      );
      return;
    }

    await _ensurePeerConnection(video: video);

    final offer = await _peerConnection!.createOffer();
    await _peerConnection!.setLocalDescription(offer);

    final callId = 'call-${DateTime.now().microsecondsSinceEpoch}';
    _activeCallId = callId;

    await _chat.sendCallSignal(
      channel: _callChannel!,
      event: 'call-offer',
      payload: <String, dynamic>{
        'callId': callId,
        'fromUserId': myUserId,
        'toUserId': widget.conversation.otherUserId,
        'type': video ? 'video' : 'voice',
        'offer': offer.toMap(),
      },
    );

    setState(() {
      _inCall = true;
      _isVideoCall = video;
      _isIncomingCall = false;
      _callStatus = 'calling';
    });

    _startOutgoingRingTimeout(
      callId: callId,
      video: video,
    );
  }

  Future<void> _acceptIncomingCall() async {
    final incoming = _incomingOffer;
    if (incoming == null) return;

    final type = incoming['type']?.toString() == 'video' ? 'video' : 'voice';
    final granted = await _ensureCallPermissions(video: type == 'video');
    if (!granted) {
      await _rejectIncomingCall();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Permission denied. Call rejected.')),
      );
      return;
    }

    final offerRaw = incoming['offer'];
    final offer = Map<String, dynamic>.from(offerRaw as Map);

    await _ensurePeerConnection(video: type == 'video');

    await _peerConnection!.setRemoteDescription(
      RTCSessionDescription(
        offer['sdp']?.toString(),
        offer['type']?.toString(),
      ),
    );

    final answer = await _peerConnection!.createAnswer();
    await _peerConnection!.setLocalDescription(answer);

    await _chat.sendCallSignal(
      channel: _callChannel!,
      event: 'call-answer',
      payload: <String, dynamic>{
        'callId': incoming['callId'],
        'fromUserId': _chat.currentUserId,
        'toUserId': incoming['fromUserId'],
        'answer': answer.toMap(),
      },
    );

    setState(() {
      _activeCallId = incoming['callId']?.toString();
      _inCall = true;
      _isVideoCall = type == 'video';
      _isIncomingCall = false;
      _incomingOffer = null;
      _callStatus = 'connecting';
    });

    _incomingRingTimeout?.cancel();
    _incomingRingTimeout = null;
  }

  Future<void> _rejectIncomingCall() async {
    final incoming = _incomingOffer;
    if (incoming != null) {
      await _chat.sendCallSignal(
        channel: _callChannel!,
        event: 'call-reject',
        payload: <String, dynamic>{
          'callId': incoming['callId'],
          'fromUserId': _chat.currentUserId,
          'toUserId': incoming['fromUserId'],
        },
      );
    }

    setState(() {
      _incomingOffer = null;
      _isIncomingCall = false;
      _callStatus = 'idle';
    });

    _incomingRingTimeout?.cancel();
    _incomingRingTimeout = null;
  }

  Future<void> _onCallSignal(String event, Map<String, dynamic> payload) async {
    switch (event) {
      case 'call-offer':
        if (_inCall || _isIncomingCall) {
          await _chat.sendCallSignal(
            channel: _callChannel!,
            event: 'call-reject',
            payload: <String, dynamic>{
              'callId': payload['callId'],
              'fromUserId': _chat.currentUserId,
              'toUserId': payload['fromUserId'],
            },
          );
          return;
        }
        setState(() {
          _incomingOffer = payload;
          _isIncomingCall = true;
          _callStatus = 'incoming';
        });
        _startIncomingRingTimeout(callId: payload['callId']?.toString() ?? '');
        break;
      case 'call-answer':
        final peer = _peerConnection;
        if (peer == null) return;
        if (payload['callId']?.toString() != _activeCallId) return;
        _outgoingRingTimeout?.cancel();
        _outgoingRingTimeout = null;
        final answerRaw = payload['answer'];
        if (answerRaw is! Map) return;
        final answer = Map<String, dynamic>.from(answerRaw);
        await peer.setRemoteDescription(
          RTCSessionDescription(
            answer['sdp']?.toString(),
            answer['type']?.toString(),
          ),
        );
        if (!mounted) return;
        setState(() => _callStatus = 'connecting');
        break;
      case 'call-ice':
        final peer = _peerConnection;
        if (peer == null) return;
        if (payload['callId']?.toString() != _activeCallId) return;
        final candidateRaw = payload['candidate'];
        if (candidateRaw is! Map) return;
        final candidate = Map<String, dynamic>.from(candidateRaw);
        await peer.addCandidate(
          RTCIceCandidate(
            candidate['candidate']?.toString(),
            candidate['sdpMid']?.toString(),
            candidate['sdpMLineIndex'] is int
                ? candidate['sdpMLineIndex'] as int
                : int.tryParse(candidate['sdpMLineIndex']?.toString() ?? '0'),
          ),
        );
        break;
      case 'call-end':
        if (_inCall) {
          await _logCallEvent('${_isVideoCall ? 'Video' : 'Voice'} call ended');
        }
        _endCall(notifyRemote: false);
        break;
      case 'call-reject':
        if (_inCall && _callStatus == 'calling') {
          await _logCallEvent('Missed ${_isVideoCall ? 'video' : 'voice'} call');
        }
        _endCall(notifyRemote: false);
        break;
    }
  }

  Future<void> _ensurePeerConnection({required bool video}) async {
    if (_peerConnection != null) return;

    final config = <String, dynamic>{
      'iceServers': <Map<String, dynamic>>[
        <String, dynamic>{'urls': 'stun:stun.l.google.com:19302'},
      ],
    };

    final peer = await createPeerConnection(config);
    _peerConnection = peer;

    final mediaConstraints = <String, dynamic>{
      'audio': true,
      'video': video
          ? <String, dynamic>{
              'facingMode': 'user',
            }
          : false,
    };

    final stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    _localStream = stream;
    _localRenderer.srcObject = stream;

    for (final track in stream.getTracks()) {
      await peer.addTrack(track, stream);
    }

    peer.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams.first;
        _remoteRenderer.srcObject = _remoteStream;
        if (mounted) {
          setState(() {
            _callStatus = 'active';
          });
        }
        _outgoingRingTimeout?.cancel();
        _outgoingRingTimeout = null;
      }
    };

    peer.onIceCandidate = (candidate) {
      if (candidate.candidate == null || _callChannel == null || _activeCallId == null) return;
      _chat.sendCallSignal(
        channel: _callChannel!,
        event: 'call-ice',
        payload: <String, dynamic>{
          'callId': _activeCallId,
          'fromUserId': _chat.currentUserId,
          'toUserId': widget.conversation.otherUserId,
          'candidate': candidate.toMap(),
        },
      );
    };
  }

  Future<bool> _ensureCallPermissions({required bool video}) async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) return false;

    if (!video) return true;
    final camera = await Permission.camera.request();
    return camera.isGranted;
  }

  Future<void> _toggleMute() async {
    final stream = _localStream;
    if (stream == null) return;
    final newMuted = !_isMuted;
    for (final track in stream.getAudioTracks()) {
      track.enabled = !newMuted;
    }
    setState(() => _isMuted = newMuted);
  }

  Future<void> _endCall({required bool notifyRemote}) async {
    final wasInCall = _inCall;
    final wasActive = _callStatus == 'active';
    _cancelRingTimeouts();

    if (notifyRemote && _callChannel != null && _activeCallId != null && widget.conversation.otherUserId.isNotEmpty) {
      await _chat.sendCallSignal(
        channel: _callChannel!,
        event: 'call-end',
        payload: <String, dynamic>{
          'callId': _activeCallId,
          'fromUserId': _chat.currentUserId,
          'toUserId': widget.conversation.otherUserId,
        },
      );
    }

    if (notifyRemote && wasInCall && wasActive) {
      await _logCallEvent('${_isVideoCall ? 'Video' : 'Voice'} call ended');
    }

    await _peerConnection?.close();
    _peerConnection = null;

    final local = _localStream;
    if (local != null) {
      for (final track in local.getTracks()) {
        await track.stop();
      }
    }

    final remote = _remoteStream;
    if (remote != null) {
      for (final track in remote.getTracks()) {
        await track.stop();
      }
    }

    _localRenderer.srcObject = null;
    _remoteRenderer.srcObject = null;
    _localStream = null;
    _remoteStream = null;

    if (!mounted) return;
    setState(() {
      _inCall = false;
      _isIncomingCall = false;
      _isVideoCall = false;
      _isMuted = false;
      _activeCallId = null;
      _incomingOffer = null;
      _callStatus = 'idle';
    });
  }

  void _startOutgoingRingTimeout({
    required String callId,
    required bool video,
  }) {
    _outgoingRingTimeout?.cancel();
    _outgoingRingTimeout = Timer(const Duration(seconds: 30), () async {
      if (!mounted) return;
      if (!_inCall || _activeCallId != callId || _callStatus != 'calling') return;

      if (_callChannel != null && widget.conversation.otherUserId.isNotEmpty) {
        await _chat.sendCallSignal(
          channel: _callChannel!,
          event: 'call-end',
          payload: <String, dynamic>{
            'callId': callId,
            'fromUserId': _chat.currentUserId,
            'toUserId': widget.conversation.otherUserId,
          },
        );
      }

      await _logCallEvent('Missed ${video ? 'video' : 'voice'} call');
      await _endCall(notifyRemote: false);
    });
  }

  void _startIncomingRingTimeout({
    required String callId,
  }) {
    _incomingRingTimeout?.cancel();
    _incomingRingTimeout = Timer(const Duration(seconds: 30), () async {
      if (!mounted) return;
      if (!_isIncomingCall) return;
      final currentCallId = _incomingOffer?['callId']?.toString() ?? '';
      if (currentCallId != callId) return;

      await _rejectIncomingCall();
      await _logCallEvent('Missed incoming call');
    });
  }

  void _cancelRingTimeouts() {
    _outgoingRingTimeout?.cancel();
    _incomingRingTimeout?.cancel();
    _outgoingRingTimeout = null;
    _incomingRingTimeout = null;
  }

  Future<void> _logCallEvent(String text) {
    return _chat.sendSystemMessage(
      conversationId: widget.conversation.id,
      text: text,
      mediaType: 'call_event',
    );
  }

  @override
  Widget build(BuildContext context) {
    final myUserId = _chat.currentUserId;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.conversation.title),
        actions: [
          IconButton(
            tooltip: 'Voice call',
            onPressed: () => _startCall(video: false),
            icon: const Icon(Icons.call_outlined),
          ),
          IconButton(
            tooltip: 'Video call',
            onPressed: () => _startCall(video: true),
            icon: const Icon(Icons.videocam_outlined),
          ),
        ],
      ),
      body: Stack(
        children: [
          Column(
            children: [
              Expanded(child: _buildMessages(myUserId)),
              if (_isPeerTyping)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Typing…',
                      style: TextStyle(
                        color: OpiumPalette.mutedForeground,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          onChanged: _onComposerChanged,
                          onSubmitted: (_) => _send(),
                          decoration: const InputDecoration(hintText: 'Message...'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: _send,
                        child: const Text('Send'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          if (_isIncomingCall || _inCall) _buildCallOverlay(),
        ],
      ),
    );
  }

  Widget _buildMessages(String myUserId) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(child: Text(_error!));
    }
    if (_messages.isEmpty) {
      return const Center(child: Text('No messages yet'));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final message = _messages[index];
        final isMine = message.senderId == myUserId;
        final text = message.content.trim().isEmpty ? '[media]' : message.content;

        return Align(
          alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: isMine ? Theme.of(context).colorScheme.primary : OpiumPalette.secondary,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(text),
          ),
        );
      },
    );
  }

  Widget _buildCallOverlay() {
    final isIncoming = _isIncomingCall;

    return Container(
      color: Colors.black.withValues(alpha: 0.84),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const SizedBox(height: 24),
          Text(
            isIncoming ? 'Incoming ${_incomingOffer?['type'] == 'video' ? 'video' : 'voice'} call' : '${_isVideoCall ? 'Video' : 'Voice'} call',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(_callStatus),
          const SizedBox(height: 14),
          if (_isVideoCall || (_incomingOffer?['type'] == 'video'))
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: RTCVideoView(_remoteRenderer),
              ),
            )
          else
            const Spacer(),
          const SizedBox(height: 12),
          SizedBox(
            height: 120,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Wrap(
                alignment: WrapAlignment.center,
                spacing: 14,
                children: [
                  if (isIncoming)
                    FilledButton.tonal(
                      onPressed: _acceptIncomingCall,
                      child: const Text('Accept'),
                    ),
                  if (isIncoming)
                    FilledButton.tonal(
                      onPressed: _rejectIncomingCall,
                      child: const Text('Reject'),
                    ),
                  if (!isIncoming)
                    FilledButton.tonal(
                      onPressed: _toggleMute,
                      child: Text(_isMuted ? 'Unmute' : 'Mute'),
                    ),
                  FilledButton(
                    onPressed: () => _endCall(notifyRemote: !isIncoming),
                    child: const Text('End call'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NewChatSheet extends StatefulWidget {
  const _NewChatSheet({required this.chat});

  final RealtimeChatService chat;

  @override
  State<_NewChatSheet> createState() => _NewChatSheetState();
}

class _NewChatSheetState extends State<_NewChatSheet> {
  final TextEditingController _queryController = TextEditingController();
  List<ChatUser> _results = const <ChatUser>[];
  bool _isLoading = false;
  String _query = '';

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final query = _queryController.text.trim();
    setState(() {
      _query = query;
      _isLoading = true;
    });

    try {
      final users = await widget.chat.searchUsers(query);
      if (!mounted) return;
      setState(() {
        _results = users;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _results = const <ChatUser>[];
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 14,
        right: 14,
        top: 10,
        bottom: MediaQuery.of(context).viewInsets.bottom + 14,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('New Chat', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          TextField(
            controller: _queryController,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _search(),
            decoration: InputDecoration(
              hintText: 'Search users',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(
                onPressed: _search,
                icon: const Icon(Icons.arrow_forward),
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 320,
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _query.length < 2
                    ? const Center(child: Text('Type at least 2 characters'))
                    : _results.isEmpty
                        ? const Center(child: Text('No users found'))
                        : ListView.separated(
                            itemCount: _results.length,
                            separatorBuilder: (context, index) => const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final user = _results[index];
                              final leadingText = user.displayName.isEmpty ? 'U' : user.displayName[0].toUpperCase();
                              return ListTile(
                                leading: CircleAvatar(child: Text(leadingText)),
                                title: Text(user.displayName),
                                subtitle: Text('@${user.username}'),
                                onTap: () => Navigator.of(context).pop(user),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}
