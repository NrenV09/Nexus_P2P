import { BatchManifest, BatchTransferState, FileManifestItem } from './types';

const CHUNK_SIZE = 32 * 1024; // 32 KB chunk for optimal SCTP throughput
const BUFFER_THRESHOLD = 256 * 1024; // 256 KB bufferedAmountLowThreshold

export interface BatchTransferCallbacks {
  onStateChange: (state: BatchTransferState) => void;
  onFileReceived: (file: File, batchId: string, fileIndex: number) => void;
  onBatchCompleted: (batchId: string, direction: 'outgoing' | 'incoming') => void;
  onLog: (type: 'transfer' | 'error', message: string, metadata?: any) => void;
}

interface QueuedOutgoingBatch {
  batchId: string;
  files: File[];
  targetId: string;
  targetName?: string;
  manifest: BatchManifest;
}

export class BatchTransferManager {
  private channel: RTCDataChannel;
  private localPeerId: string;
  private localPeerName: string;
  private callbacks: BatchTransferCallbacks;

  // Queuing & Active States
  private outgoingQueue: QueuedOutgoingBatch[] = [];
  private activeOutgoingBatch: QueuedOutgoingBatch | null = null;
  private isSending: boolean = false;
  private cancelRequested: Set<string> = new Set();

  // Incoming State
  private activeIncomingState: BatchTransferState | null = null;
  private activeIncomingManifest: BatchManifest | null = null;
  private incomingFileChunks: ArrayBuffer[] = [];
  private incomingReceivedBytes: number = 0;
  private incomingCurrentFileIndex: number = 0;

  // Throughput calculation
  private bytesTransferredWindow: number = 0;
  private lastSpeedCalculationTime: number = Date.now();
  private currentSpeedStr: string = '0 KB/s';

  constructor(
    channel: RTCDataChannel,
    localPeerId: string,
    localPeerName: string,
    callbacks: BatchTransferCallbacks
  ) {
    this.channel = channel;
    this.localPeerId = localPeerId;
    this.localPeerName = localPeerName;
    this.callbacks = callbacks;

    this.initChannel();
  }

  /**
   * Rebinds to a new RTCDataChannel if connection renegotiated
   */
  public updateChannel(channel: RTCDataChannel) {
    this.channel = channel;
    this.initChannel();
  }

  private initChannel() {
    this.channel.binaryType = 'arraybuffer';
    try {
      this.channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;
    } catch {
      // Ignored if unsupported in specific browser
    }

    this.channel.onmessage = (event) => this.handleChannelMessage(event);
    this.channel.onerror = (err) => {
      this.callbacks.onLog('error', `BatchTransferManager channel error: ${(err as any)?.message || 'Unknown error'}`);
    };
    this.channel.onclose = () => {
      this.callbacks.onLog('transfer', `Batch transfer channel closed.`);
    };
  }

  /**
   * Enqueue a batch of files for sending to a remote peer
   */
  public enqueueBatch(files: File[], targetId: string, targetName?: string): string {
    if (files.length === 0) return '';

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

    const manifestItems: FileManifestItem[] = files.map((file, idx) => ({
      index: idx,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    }));

    const manifest: BatchManifest = {
      batchId,
      senderId: this.localPeerId,
      senderName: this.localPeerName,
      targetId,
      totalFiles: files.length,
      totalBytes,
      files: manifestItems
    };

    const queuedItem: QueuedOutgoingBatch = {
      batchId,
      files,
      targetId,
      targetName,
      manifest
    };

    this.outgoingQueue.push(queuedItem);

    // Initial queued state
    const initialState: BatchTransferState = {
      batchId,
      targetId,
      targetName,
      direction: 'outgoing',
      status: 'queued',
      totalFiles: files.length,
      totalBytes,
      transferredBytes: 0,
      currentFileIndex: 0,
      currentFileName: files[0]?.name || '',
      progress: 0,
      speed: 'Queued',
      files: files.map(f => ({
        name: f.name,
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
        status: 'pending',
        progress: 0
      }))
    };

    this.callbacks.onStateChange(initialState);
    this.callbacks.onLog('transfer', `Queued batch [${batchId.substring(0, 12)}] containing ${files.length} files (${this.formatBytes(totalBytes)}) for ${targetName || targetId}`, { batchId });

    this.processOutgoingQueue();
    return batchId;
  }

  /**
   * Cancel a batch by ID
   */
  public cancelBatch(batchId: string) {
    this.cancelRequested.add(batchId);
    if (this.activeOutgoingBatch && this.activeOutgoingBatch.batchId === batchId) {
      this.sendControlMessage({ type: 'batch-cancel', batchId });
    }
  }

  /**
   * Processes the next batch in the outgoing queue if ready
   */
  private processOutgoingQueue() {
    if (this.isSending || this.activeOutgoingBatch) return;
    if (this.outgoingQueue.length === 0) return;

    if (this.channel.readyState !== 'open') {
      // Wait for channel open
      const onOpen = () => {
        this.channel.removeEventListener('open', onOpen);
        this.processOutgoingQueue();
      };
      this.channel.addEventListener('open', onOpen);
      return;
    }

    const nextBatch = this.outgoingQueue.shift()!;
    this.activeOutgoingBatch = nextBatch;
    this.isSending = true;

    // Send Manifest Handshake
    this.callbacks.onLog('transfer', `Transmitting Batch Manifest for ${nextBatch.manifest.totalFiles} files (${this.formatBytes(nextBatch.manifest.totalBytes)}) to ${nextBatch.targetName || nextBatch.targetId}...`, { batchId: nextBatch.batchId });

    this.updateOutgoingState(nextBatch, {
      status: 'negotiating',
      speed: 'Negotiating...'
    });

    this.sendControlMessage({
      type: 'batch-manifest',
      manifest: nextBatch.manifest
    });
  }

  /**
   * Handles incoming DataChannel messages (control JSON or binary chunk)
   */
  private handleChannelMessage(event: MessageEvent) {
    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        this.handleControlMessage(msg);
      } catch (e) {
        console.error('Invalid control message on batch channel:', e);
      }
    } else if (event.data instanceof ArrayBuffer) {
      this.handleBinaryChunk(event.data);
    }
  }

  /**
   * Control signaling over the dedicated file transfer channel
   */
  private handleControlMessage(msg: any) {
    switch (msg.type) {
      case 'batch-manifest': {
        const manifest = msg.manifest as BatchManifest;
        this.callbacks.onLog('transfer', `Received Batch Manifest from ${manifest.senderName}: ${manifest.totalFiles} files (${this.formatBytes(manifest.totalBytes)})`, { batchId: manifest.batchId });

        const incomingState: BatchTransferState = {
          batchId: manifest.batchId,
          targetId: manifest.senderId,
          targetName: manifest.senderName,
          direction: 'incoming',
          status: 'accepted',
          totalFiles: manifest.totalFiles,
          totalBytes: manifest.totalBytes,
          transferredBytes: 0,
          currentFileIndex: 0,
          currentFileName: manifest.files[0]?.name || '',
          progress: 0,
          speed: 'Receiving...',
          files: manifest.files.map(f => ({
            name: f.name,
            size: f.size,
            mimeType: f.mimeType,
            status: 'pending',
            progress: 0
          }))
        };

        this.activeIncomingState = incomingState;
        this.activeIncomingManifest = manifest;
        this.incomingFileChunks = [];
        this.incomingReceivedBytes = 0;
        this.incomingCurrentFileIndex = 0;
        this.callbacks.onStateChange(incomingState);

        // Acknowledge readiness to accept the batch
        this.sendControlMessage({
          type: 'batch-accept',
          batchId: manifest.batchId
        });
        break;
      }

      case 'batch-accept': {
        const { batchId } = msg;
        if (this.activeOutgoingBatch && this.activeOutgoingBatch.batchId === batchId) {
          this.callbacks.onLog('transfer', `Remote peer acknowledged batch [${batchId.substring(0, 10)}]. Starting chunk stream with backpressure flow control...`, { batchId });
          this.startStreamingBatch(this.activeOutgoingBatch);
        }
        break;
      }

      case 'batch-reject': {
        const { batchId, reason } = msg;
        if (this.activeOutgoingBatch && this.activeOutgoingBatch.batchId === batchId) {
          this.callbacks.onLog('error', `Remote peer rejected batch [${batchId}]: ${reason || 'Busy'}`);
          this.updateOutgoingState(this.activeOutgoingBatch, {
            status: 'rejected',
            speed: 'Rejected'
          });
          this.finishOutgoingBatch();
        }
        break;
      }

      case 'batch-cancel': {
        const { batchId } = msg;
        if (this.activeIncomingState && this.activeIncomingState.batchId === batchId) {
          this.callbacks.onLog('error', `Sender cancelled batch [${batchId}]`);
          this.activeIncomingState.status = 'failed';
          this.callbacks.onStateChange({ ...this.activeIncomingState });
          this.activeIncomingState = null;
          this.activeIncomingManifest = null;
          this.incomingFileChunks = [];
        }
        break;
      }

      case 'file-start': {
        const { fileIndex, name } = msg;
        this.incomingCurrentFileIndex = fileIndex;
        this.incomingFileChunks = [];
        if (this.activeIncomingState) {
          this.activeIncomingState.currentFileIndex = fileIndex;
          this.activeIncomingState.currentFileName = name;
          if (this.activeIncomingState.files[fileIndex]) {
            this.activeIncomingState.files[fileIndex].status = 'transferring';
          }
          this.callbacks.onStateChange({ ...this.activeIncomingState });
        }
        break;
      }

      case 'file-end': {
        const { fileIndex } = msg;
        this.assembleIncomingFile(fileIndex);
        break;
      }

      case 'batch-complete': {
        const { batchId } = msg;
        if (this.activeIncomingState && this.activeIncomingState.batchId === batchId) {
          this.activeIncomingState.status = 'completed';
          this.activeIncomingState.progress = 100;
          this.activeIncomingState.speed = 'Done';
          this.callbacks.onStateChange({ ...this.activeIncomingState });
          this.callbacks.onBatchCompleted(batchId, 'incoming');
          this.callbacks.onLog('transfer', `Successfully received all ${this.activeIncomingState.totalFiles} files from batch [${batchId.substring(0, 10)}]`, { batchId });
          this.activeIncomingState = null;
          this.activeIncomingManifest = null;
        }
        break;
      }
    }
  }

  /**
   * Handles binary chunk received over SCTP DataChannel
   * Binary packet format:
   * [0..3]: Uint32 File Index
   * [4..7]: Uint32 Chunk Index
   * [8..]: Raw Chunk Payload
   */
  private handleBinaryChunk(buffer: ArrayBuffer) {
    if (!this.activeIncomingState || buffer.byteLength < 8) return;

    const view = new DataView(buffer);
    const fileIndex = view.getUint32(0, false);
    // const chunkIndex = view.getUint32(4, false);
    const payload = buffer.slice(8);

    if (fileIndex !== this.incomingCurrentFileIndex) {
      // Chunk for a different file, adjust if needed
      this.incomingCurrentFileIndex = fileIndex;
    }

    this.incomingFileChunks.push(payload);
    this.incomingReceivedBytes += payload.byteLength;
    this.activeIncomingState.transferredBytes += payload.byteLength;

    // Throughput calculation
    this.trackThroughput(payload.byteLength);

    const totalBytes = this.activeIncomingState.totalBytes;
    const progress = totalBytes > 0 ? Math.min(100, Math.round((this.activeIncomingState.transferredBytes / totalBytes) * 100)) : 0;
    this.activeIncomingState.progress = progress;
    this.activeIncomingState.speed = this.currentSpeedStr;

    // Update single file progress
    const fileMeta = this.activeIncomingManifest?.files[fileIndex];
    if (fileMeta && this.activeIncomingState.files[fileIndex]) {
      const currentFileReceived = this.incomingFileChunks.reduce((acc, c) => acc + c.byteLength, 0);
      this.activeIncomingState.files[fileIndex].progress = Math.min(100, Math.round((currentFileReceived / fileMeta.size) * 100));
    }

    this.callbacks.onStateChange({ ...this.activeIncomingState });
  }

  /**
   * Reconstructs completed file from received binary chunks
   */
  private assembleIncomingFile(fileIndex: number) {
    if (!this.activeIncomingManifest || !this.activeIncomingState) return;

    const fileMeta = this.activeIncomingManifest.files[fileIndex];
    if (!fileMeta) return;

    const blob = new Blob(this.incomingFileChunks, { type: fileMeta.mimeType });
    const file = new File([blob], fileMeta.name, { type: fileMeta.mimeType });

    if (this.activeIncomingState.files[fileIndex]) {
      this.activeIncomingState.files[fileIndex].status = 'completed';
      this.activeIncomingState.files[fileIndex].progress = 100;
      this.callbacks.onStateChange({ ...this.activeIncomingState });
    }

    this.callbacks.onFileReceived(file, this.activeIncomingState.batchId, fileIndex);
    this.callbacks.onLog('transfer', `File complete (${fileIndex + 1}/${this.activeIncomingState.totalFiles}): "${file.name}" (${this.formatBytes(file.size)})`, {
      batchId: this.activeIncomingState.batchId,
      fileName: file.name
    });

    // Reset chunks for next file in batch
    this.incomingFileChunks = [];
  }

  /**
   * Streams files in batch with SCTP backpressure
   */
  private async startStreamingBatch(batch: QueuedOutgoingBatch) {
    this.updateOutgoingState(batch, {
      status: 'streaming',
      speed: 'Streaming...'
    });

    let cumulativeSent = 0;
    const totalBytes = batch.manifest.totalBytes;

    for (let fIdx = 0; fIdx < batch.files.length; fIdx++) {
      if (this.cancelRequested.has(batch.batchId)) {
        this.callbacks.onLog('transfer', `Batch [${batch.batchId}] cancelled by local user.`);
        this.updateOutgoingState(batch, { status: 'failed', speed: 'Cancelled' });
        this.finishOutgoingBatch();
        return;
      }

      const file = batch.files[fIdx];

      // Notify file start
      this.sendControlMessage({
        type: 'file-start',
        batchId: batch.batchId,
        fileIndex: fIdx,
        name: file.name,
        size: file.size
      });

      this.updateOutgoingState(batch, {
        currentFileIndex: fIdx,
        currentFileName: file.name,
        fileUpdate: { index: fIdx, status: 'transferring', progress: 0 }
      });

      const reader = file.stream().getReader();
      let fileSentBytes = 0;
      let chunkIndex = 0;

      try {
        while (true) {
          if (this.cancelRequested.has(batch.batchId)) {
            reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          for (let i = 0; i < value.byteLength; i += CHUNK_SIZE) {
            // Apply Concurrent Backpressure: wait if SCTP buffer is full
            await this.waitForSCTPBuffer();

            if (this.channel.readyState !== 'open') {
              throw new Error('DataChannel closed unexpectedly during file transmission');
            }

            const slice = value.subarray(i, Math.min(i + CHUNK_SIZE, value.byteLength));

            // Packet format: [4 bytes fileIndex][4 bytes chunkIndex][payload]
            const packet = new Uint8Array(8 + slice.byteLength);
            const view = new DataView(packet.buffer);
            view.setUint32(0, fIdx, false);
            view.setUint32(4, chunkIndex, false);
            packet.set(slice, 8);

            this.channel.send(packet.buffer);

            chunkIndex++;
            fileSentBytes += slice.byteLength;
            cumulativeSent += slice.byteLength;

            this.trackThroughput(slice.byteLength);

            const batchProgress = totalBytes > 0 ? Math.min(100, Math.round((cumulativeSent / totalBytes) * 100)) : 0;
            const fileProgress = file.size > 0 ? Math.min(100, Math.round((fileSentBytes / file.size) * 100)) : 100;

            this.updateOutgoingState(batch, {
              transferredBytes: cumulativeSent,
              progress: batchProgress,
              speed: this.currentSpeedStr,
              fileUpdate: { index: fIdx, status: 'transferring', progress: fileProgress }
            });
          }
        }
      } catch (err: any) {
        this.callbacks.onLog('error', `Failed sending file "${file.name}": ${err.message}`);
        this.updateOutgoingState(batch, {
          status: 'failed',
          speed: 'Error',
          fileUpdate: { index: fIdx, status: 'failed', progress: 0 }
        });
        this.finishOutgoingBatch();
        return;
      }

      // Notify file end
      this.sendControlMessage({
        type: 'file-end',
        batchId: batch.batchId,
        fileIndex: fIdx
      });

      this.updateOutgoingState(batch, {
        fileUpdate: { index: fIdx, status: 'completed', progress: 100 }
      });
    }

    // Notify whole batch completed
    this.sendControlMessage({
      type: 'batch-complete',
      batchId: batch.batchId
    });

    this.updateOutgoingState(batch, {
      status: 'completed',
      progress: 100,
      speed: 'Complete'
    });

    this.callbacks.onBatchCompleted(batch.batchId, 'outgoing');
    this.callbacks.onLog('transfer', `Successfully transmitted all ${batch.files.length} files in batch [${batch.batchId.substring(0, 10)}] to ${batch.targetName || batch.targetId}`);

    this.finishOutgoingBatch();
  }

  /**
   * SCTP Backpressure: Asynchronously halts loop if bufferedAmount > threshold
   */
  private waitForSCTPBuffer(): Promise<void> {
    if (this.channel.bufferedAmount <= (this.channel.bufferedAmountLowThreshold || BUFFER_THRESHOLD)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const onLow = () => {
        this.channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      this.channel.addEventListener('bufferedamountlow', onLow);

      // Fallback timeout to prevent deadlock
      setTimeout(() => {
        this.channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      }, 50);
    });
  }

  private finishOutgoingBatch() {
    this.isSending = false;
    this.activeOutgoingBatch = null;
    // Drain next queued batch if any
    setTimeout(() => this.processOutgoingQueue(), 100);
  }

  private sendControlMessage(msg: any) {
    if (this.channel.readyState === 'open') {
      try {
        this.channel.send(JSON.stringify(msg));
      } catch (err: any) {
        console.error('Failed to send control message:', err);
      }
    }
  }

  private trackThroughput(bytes: number) {
    this.bytesTransferredWindow += bytes;
    const now = Date.now();
    const elapsed = now - this.lastSpeedCalculationTime;
    if (elapsed >= 500) {
      const bytesPerSec = (this.bytesTransferredWindow / elapsed) * 1000;
      this.currentSpeedStr = this.formatSpeed(bytesPerSec);
      this.bytesTransferredWindow = 0;
      this.lastSpeedCalculationTime = now;
    }
  }

  private updateOutgoingState(
    batch: QueuedOutgoingBatch,
    updates: Partial<BatchTransferState> & { fileUpdate?: { index: number; status: 'pending' | 'transferring' | 'completed' | 'failed'; progress: number } }
  ) {
    const updatedState: BatchTransferState = {
      batchId: batch.batchId,
      targetId: batch.targetId,
      targetName: batch.targetName,
      direction: 'outgoing',
      status: updates.status || 'streaming',
      totalFiles: batch.manifest.totalFiles,
      totalBytes: batch.manifest.totalBytes,
      transferredBytes: updates.transferredBytes ?? 0,
      currentFileIndex: updates.currentFileIndex ?? 0,
      currentFileName: updates.currentFileName ?? batch.files[0]?.name ?? '',
      progress: updates.progress ?? 0,
      speed: updates.speed || this.currentSpeedStr,
      files: batch.files.map((f, i) => {
        if (updates.fileUpdate && updates.fileUpdate.index === i) {
          return {
            name: f.name,
            size: f.size,
            mimeType: f.type || 'application/octet-stream',
            status: updates.fileUpdate.status,
            progress: updates.fileUpdate.progress
          };
        }
        return {
          name: f.name,
          size: f.size,
          mimeType: f.type || 'application/octet-stream',
          status: 'pending',
          progress: 0
        };
      })
    };

    this.callbacks.onStateChange(updatedState);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec > 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  }
}
