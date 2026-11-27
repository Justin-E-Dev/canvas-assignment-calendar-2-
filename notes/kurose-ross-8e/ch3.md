# Chapter 3: Transport Layer

The transport layer sits between the application layer and the network layer. Its job is to extend the network's host-to-host delivery into **process-to-process** delivery. This chapter explains how that works (multiplexing), the simple UDP protocol, the general principles of how to transfer data reliably over an unreliable network, how TCP does it in practice, why congestion happens, and how TCP's congestion control works. It ends with newer developments like QUIC. This is one of the most heavily tested chapters.

## 3.1 Introduction and Transport-Layer Services

- A transport-layer protocol provides **logical communication** between **application processes** running on different hosts. "Logical" means the processes act as if they were directly connected, even though they may be on opposite sides of the world, with many routers and links in between.
- Transport protocols run in the **end systems**, not in routers. Routers only look at network-layer fields; they don't care about transport-layer segments.
- At the sender, the transport layer takes application messages, breaks them into smaller chunks if needed, adds a transport header to each, and creates **segments**. It passes each segment to the network layer, which wraps it in a **datagram** and sends it. At the receiver, the network layer pulls out the segment and passes it up to the transport layer, which delivers the data to the right application.

### Transport vs. network layer
- **Network layer:** logical communication between **hosts**.
- **Transport layer:** logical communication between **processes**, relying on (and enhancing) the network layer.
- Household analogy: two houses, each with 12 kids writing letters to the kids in the other house. In each house, one kid (Ann in one, Bill in the other) collects the mail and hands it to the postal service. The **postal service** is the network layer (house-to-house delivery). **Ann and Bill** are the transport layer (delivering to the right kid within the house). The **letters** are application messages and the **kids** are processes.
- The transport layer's services are limited by the network layer's. For example, if the network layer gives no delay guarantee, the transport layer can't guarantee delay either. But the transport layer *can* add services the network doesn't provide, such as **reliable delivery** (even when the network loses packets) and **encryption**.

### Overview of the Internet's transport layer
- The network layer protocol is **IP**, which provides a **best-effort delivery service**: it makes its "best effort" to deliver segments but **makes no guarantees**. It doesn't guarantee delivery, in-order delivery or data integrity. IP is called an **unreliable service**.
- **UDP** and **TCP** both extend IP's host-to-host delivery to process-to-process delivery (**transport-layer multiplexing and demultiplexing**) and both offer **error checking** through header checksums. Those are the *only* two services UDP provides.
- **TCP** adds:
  - **Reliable data transfer:** using flow control, sequence numbers, acknowledgments and timers, TCP makes sure data is delivered correctly and in order.
  - **Congestion control:** TCP keeps any one connection from swamping the network's links and routers, and aims to share bandwidth fairly. This is more a service to the Internet as a whole than to the one app.

## 3.2 Multiplexing and Demultiplexing

- **Demultiplexing (receiver side):** delivering the data in each arriving segment to the correct **socket**.
- **Multiplexing (sender side):** gathering data from different sockets, adding headers (with port information) to make segments, and passing them to the network layer.
- Each socket has a unique identifier, and each segment has special fields that indicate which socket it's for: the **source port number** and **destination port number** fields.
  - Port numbers are 16-bit numbers from 0 to 65535.
  - Ports **0 to 1023** are **well-known port numbers**, reserved for well-known protocols (HTTP 80, FTP 21).
  - Hosts look at the destination port number in a segment to direct it to the right socket.

### Connectionless (UDP) demultiplexing
- A UDP socket is fully identified by a **two-tuple**: **(destination IP address, destination port number)**.
- If two UDP segments have different source IP addresses or source ports but the **same destination IP and destination port**, they're delivered to the **same socket**.
- The source port number is carried so the receiver can reply: it serves as the "return address."

### Connection-oriented (TCP) demultiplexing
- A TCP socket is identified by a **four-tuple**: **(source IP address, source port number, destination IP address, destination port number)**.
- So two segments arriving with different source IPs or source ports go to **different sockets**, even if they have the same destination port (except for the segment that initially sets up the connection).
- A TCP server has a **welcoming socket** waiting for connection requests on a known port (like 12000). When a connection request arrives, the server creates a **new socket** for that connection, identified by the full four-tuple. A server can have many simultaneous TCP sockets, one per connection.
- **Web servers:** a web server listening on port 80 gets all requests on port 80, but each client connection uses a separate socket. With **non-persistent HTTP**, a new TCP connection (and new socket) is created and closed for every request/response, which can hurt the performance of busy servers. High-performing servers often use a single process with a new **thread** for each new connection.

### Port scanning
Port scanners like **nmap** probe a host's ports to see which ones are open (which have an app listening). Admins use them to find out what services are running; attackers use them to find vulnerable services.

## 3.3 Connectionless Transport: UDP

UDP (defined in RFC 768) does about as little as a transport protocol can: multiplexing/demultiplexing and light error checking. Essentially, an app using UDP is talking almost directly to IP.
- **No handshaking** before sending, which is why UDP is **connectionless**.
- DNS is a typical example. A DNS query goes out in a UDP segment; if no reply comes back (because the query or reply was lost), the app either tries another server or tells the calling app it can't get a reply.

### Why use UDP instead of TCP?
- **Finer application-level control over what is sent and when:** UDP sends data immediately; TCP's congestion control can throttle the sender, and TCP keeps retransmitting until a segment is acknowledged. Real-time apps often want a minimum sending rate, don't want too much delay, and can tolerate some loss.
- **No connection establishment:** no handshake delay. This is a main reason DNS uses UDP; it's also why QUIC (used by HTTP/3) runs on UDP.
- **No connection state:** TCP keeps state in the end systems (buffers, congestion-control parameters, sequence numbers). UDP doesn't, so a server can support many more active UDP clients.
- **Small packet header overhead:** **8 bytes** for UDP vs. **20 bytes** for TCP.

Apps that commonly use UDP: DNS, network management (SNMP), and multimedia/real-time apps like internet telephony, video conferencing and games (although many of these now use TCP or QUIC too). A concern: UDP has no congestion control, so lots of high-rate UDP traffic could congest the network and crowd out TCP traffic. Apps can still build reliability on top of UDP themselves (QUIC does exactly this).

### UDP segment structure
The header has just **four fields, each 2 bytes**:
- **Source port number**
- **Destination port number**
- **Length:** the length of the whole UDP segment (header plus data) in bytes.
- **Checksum:** used by the receiver to check for errors.
Then the application data (the message).

### UDP checksum
- Purpose: detect whether bits in the segment have been altered (by noise in the links or while stored in a router) on the way.
- **Sender:** treats the segment's contents as a series of **16-bit words**, adds them up using **one's complement** addition (any overflow carry-out is wrapped around and added back to the result), then takes the **one's complement** of the sum (flipping all the 0s and 1s). That result goes in the checksum field.
- **Receiver:** adds all the 16-bit words, *including the checksum*. If no errors were introduced, the result is all 1s (`1111111111111111`). If any bit is a 0, an error has occurred.
- Why does UDP have a checksum when lower layers often do error checking too? There's no guarantee every link along the path checks for errors, and errors can occur inside a router's memory. This follows the **end-end principle**: some functions must be done end-to-end, because doing them at lower levels may be redundant or not enough.
- UDP **detects** errors but does nothing to **recover** from them. Some implementations discard the damaged segment; others pass it to the app with a warning.

## 3.4 Principles of Reliable Data Transfer

This section builds a **reliable data transfer (rdt)** protocol step by step, from simple to realistic. The goal: the upper layer should see a reliable channel where no data bits are corrupted or lost and all are delivered in order, even though the layer below may be unreliable. Only **unidirectional data transfer** (sender to receiver) is considered, although control packets flow both ways. Each version is described with a **finite-state machine (FSM)**.

### rdt1.0: a perfectly reliable channel
- Assumes the underlying channel is completely reliable.
- The sender just sends; the receiver just receives. No feedback is needed.

### rdt2.0: a channel with bit errors
- Now bits in a packet may be corrupted (but no packets are lost).
- Human analogy: on the phone, you say "OK" after each sentence you understand, or "Please repeat that."
- Protocols based on this are called **ARQ (Automatic Repeat reQuest)** protocols. They need three things:
  - **Error detection:** a checksum, so the receiver can tell when bits are corrupted.
  - **Receiver feedback:** positive acknowledgments (**ACKs**) and negative acknowledgments (**NAKs**).
  - **Retransmission:** the sender resends a packet that arrived with errors.
- rdt2.0 is a **stop-and-wait** protocol: the sender doesn't send new data until it's sure the receiver has correctly received the current packet.
- **Fatal flaw:** what if the ACK or NAK itself is corrupted? The sender can't tell what the receiver meant. If the sender simply retransmits whenever the feedback is garbled, it may send **duplicate packets**, and the receiver can't tell whether a packet is new data or a retransmission.

### rdt2.1 and rdt2.2: handling garbled ACKs/NAKs
- Solution: add a **sequence number** to each data packet. The receiver checks the number to see whether a packet is a retransmission.
- For stop-and-wait, a **1-bit sequence number** (0 or 1) is enough.
- The sender resends the current packet if it receives a garbled ACK or NAK.
- **rdt2.2** is **NAK-free**: instead of sending a NAK, the receiver re-sends an **ACK for the last correctly received packet**. A sender that gets two ACKs for the same packet (a **duplicate ACK**) knows the next packet wasn't received correctly. The ACK must now include the sequence number of the packet being acknowledged.

### rdt3.0: a channel with errors and loss
- Now the channel can also **lose** packets (data or ACKs entirely).
- New problems: how to **detect** loss, and what to do about it.
- Solution: the **sender** waits a "reasonable" time for an ACK; if none arrives, it **retransmits**. This needs a **countdown timer** that can interrupt the sender after a given time.
  - Start the timer each time a packet is sent (first time or retransmission).
  - Respond to a timer interrupt by retransmitting.
  - Stop the timer when the ACK arrives.
- If a packet is just delayed rather than lost, the retransmission creates a **duplicate**, but sequence numbers already handle that.
- Because sequence numbers alternate between 0 and 1, rdt3.0 is sometimes called the **alternating-bit protocol**.
- rdt3.0 is **functionally correct**, but its **performance is poor**.

### Pipelined reliable data transfer protocols
**The stop-and-wait problem**, with a classic example:
- Two hosts on opposite coasts, RTT = 30 ms, link rate R = 1 Gbps, packet size L = 1000 bytes (8000 bits).
- Transmission time: L/R = 8000 bits / 10^9 bps = **8 microseconds**.
- With stop-and-wait, the sender sends one packet, then waits a full RTT for the ACK. **Sender utilization** (the fraction of time it's actually busy sending) is:
  **U_sender = (L/R) / (RTT + L/R) = 0.008 / 30.008 ≈ 0.00027**
- So the sender is busy only 0.027% of the time, an effective throughput of only about **267 kbps** on a 1 Gbps link. That's awful.

**Solution: pipelining.** Let the sender send **multiple packets without waiting for acknowledgments**. With 3 packets in flight, utilization roughly triples. Pipelining requires:
- a larger range of **sequence numbers**, since each in-flight packet needs a unique one;
- **buffering** at the sender (for sent-but-unacknowledged packets) and maybe at the receiver;
- a way to handle lost, corrupted and delayed packets. Two basic approaches: **Go-Back-N** and **Selective Repeat**.

### Go-Back-N (GBN)
- The sender may have up to **N unacknowledged packets** in the pipeline at once. N is the **window size**, so GBN is a **sliding-window protocol**.
- The sequence number space is viewed as:
  - **base:** the sequence number of the oldest unacknowledged packet;
  - **nextseqnum:** the smallest unused sequence number;
  - [0, base−1]: already sent and acknowledged;
  - [base, nextseqnum−1]: sent but not yet acknowledged;
  - [nextseqnum, base+N−1]: can be sent right away if data arrives;
  - ≥ base+N: can't be used until the window moves.
- With a k-bit sequence number field, sequence numbers range over [0, 2^k − 1] (arithmetic is modulo 2^k).
- **Cumulative ACKs:** an ACK for sequence number n means *all* packets up to and including n have been received correctly.
- **Single timer:** for the oldest transmitted but unacknowledged packet. **On timeout, the sender resends ALL unacknowledged packets** in the window. That's the "go back N" part.
- **Receiver:** very simple. It accepts only **in-order** packets. If packet n arrives correctly and in order, it delivers it and ACKs n. Otherwise (out of order or corrupted), it **discards** the packet and re-ACKs the most recent in-order packet. The receiver doesn't buffer out-of-order packets; it only needs to remember the next expected sequence number.
- Downside: one lost packet can cause many correctly received packets to be retransmitted, which is wasteful when the window and the bandwidth-delay product are large.

### Selective Repeat (SR)
- Avoids unnecessary retransmissions: the sender retransmits **only the packets it suspects were lost or corrupted**.
- The receiver **individually acknowledges** each correctly received packet, whether or not it's in order.
- **Out-of-order packets are buffered** at the receiver until the missing packets arrive; then a batch is delivered to the upper layer in order.
- **Each packet has its own logical timer**, since only one packet is retransmitted on a timeout.
- The sender's and receiver's windows won't always line up.
- Receiver rules:
  - A packet in [rcv_base, rcv_base+N−1] that arrives correctly is ACKed and buffered (if it's the base, it and the buffered packets after it are delivered).
  - A packet in [rcv_base−N, rcv_base−1] must **still be ACKed**, even though it was already received. Otherwise the sender's window would never move forward.
- **Important constraint:** the **window size must be ≤ half the sequence number space** (N ≤ 2^k / 2). If the window is too big, the receiver can't tell whether an arriving packet is a retransmission of an old one or a new packet with the same sequence number. The book's example uses sequence numbers 0–3 with a window of 3 and shows the receiver mistaking an old packet for a new one.

### Summary of reliable data transfer mechanisms
- **Checksum:** detect bit errors.
- **Timer:** time out and retransmit lost packets.
- **Sequence number:** number packets so gaps and duplicates can be detected.
- **Acknowledgment:** tell the sender a packet (or set of packets) was received correctly; may be individual or cumulative.
- **Negative acknowledgment:** tell the sender a packet was not received correctly.
- **Window, pipelining:** let the sender have multiple unacknowledged packets in flight.
- One more real-world issue: packets can be **reordered** in the network, so a very old packet with a given sequence number could show up unexpectedly. Real protocols handle this by assuming a packet can't live in the network longer than a maximum time (about 3 minutes in TCP).

## 3.5 Connection-Oriented Transport: TCP

### The TCP connection
- TCP is **connection-oriented**: before two processes exchange data, they **handshake**, exchanging preliminary segments to set up the connection's parameters and state.
- The "connection" exists only in the two end systems (state variables); routers in between know nothing about it.
- TCP provides **full-duplex** service (data can flow both ways at once) and is **point-to-point** (one sender, one receiver; multicast isn't possible with TCP).
- Setup is the **three-way handshake**: the client sends a special segment, the server responds with a special segment, and the client responds with a third segment that may carry data.
- After setup, the app's data goes into the connection's **send buffer**. TCP grabs chunks of data from the buffer and passes them to the network layer.
  - **MSS (Maximum Segment Size):** the maximum amount of **application data** in a segment (not counting headers). It's usually set so that the segment plus headers fits in a single link-layer frame. With the typical Ethernet **MTU** (Maximum Transmission Unit) of 1500 bytes, the MSS is typically **1460 bytes** (1500 − 20 bytes TCP header − 20 bytes IP header).
- Each side has a **send buffer** and a **receive buffer**.

### TCP segment structure
The TCP header is usually **20 bytes** (more if options are used). Fields:
- **Source and destination port numbers** (16 bits each): for multiplexing and demultiplexing.
- **Sequence number** (32 bits) and **acknowledgment number** (32 bits): for reliable data transfer.
- **Header length** (4 bits): the length of the TCP header in 32-bit words (varies because of options).
- **Flag bits:**
  - **ACK:** the acknowledgment field is valid.
  - **RST, SYN, FIN:** used to set up and tear down connections.
  - **PSH:** pass the data to the upper layer immediately.
  - **URG:** urgent data is present (with the **urgent data pointer**; rarely used).
  - **CWR and ECE:** used for explicit congestion notification.
- **Receive window** (16 bits): for **flow control**; the number of bytes the receiver is willing to accept.
- **Checksum** (16 bits).
- **Options** (variable): used to negotiate the MSS, a window scaling factor for high-speed networks, timestamps, etc.

### Sequence numbers and acknowledgment numbers
- TCP views data as an **unstructured, ordered stream of bytes**.
- The **sequence number of a segment** is the **byte-stream number of the first byte in the segment**. Example: a 500,000-byte file with MSS 1000 bytes is split into 500 segments; the first gets sequence number 0, the second 1000, the third 2000, and so on. (In reality the starting sequence number is chosen randomly.)
- The **acknowledgment number** is the sequence number of the **next byte the host expects** from the other side. If Host A has received bytes 0–535 from B, A puts 536 in the acknowledgment number field of its segment to B.
- TCP uses **cumulative acknowledgments**: it acknowledges bytes up to the first missing byte.
- What does a receiver do with **out-of-order segments**? The TCP standard doesn't say; in practice, receivers **keep** them and wait for the missing bytes.
- **Piggybacking:** in two-way traffic, the acknowledgment for client-to-server data is carried in a server-to-client segment that's also carrying data.
- **Telnet example:** a user types "C"; the client sends Seq=42, ACK=79, data "C". The server echoes back Seq=79, ACK=43, data "C". The client acknowledges with Seq=43, ACK=80.

### Round-trip time estimation and timeout
TCP uses a timeout and retransmit mechanism, so it needs a good timeout value: longer than the RTT, but not so long that losses are recovered slowly.
- **SampleRTT:** the measured time from sending a segment to receiving its ACK. TCP measures it for one segment at a time, and **never for retransmitted segments** (it would be ambiguous which transmission the ACK was for).
- SampleRTT fluctuates, so TCP keeps a smoothed average:
  **EstimatedRTT = (1 − α) · EstimatedRTT + α · SampleRTT**, with recommended **α = 0.125**.
  This is an **exponential weighted moving average (EWMA)**: recent samples count more, and old samples' influence fades exponentially.
- It also tracks variability:
  **DevRTT = (1 − β) · DevRTT + β · |SampleRTT − EstimatedRTT|**, with recommended **β = 0.25**.
- **Timeout interval:**
  **TimeoutInterval = EstimatedRTT + 4 · DevRTT**
  A large safety margin when RTTs vary a lot, a small one when they're steady. The recommended initial value is 1 second. When a timeout occurs, the TimeoutInterval is **doubled** to avoid a premature timeout for the next segment; once a new ACK arrives, it's recalculated from the formula.

### Reliable data transfer in TCP
TCP builds a reliable service on IP's unreliable one. A simplified TCP sender (no flow or congestion control) handles three events:
1. **Data received from the application:** create a segment with the next sequence number; start the timer if it isn't already running (TCP uses **a single retransmission timer**, for the oldest unacknowledged segment).
2. **Timeout:** retransmit the segment that caused the timeout (the oldest unACKed one, **only that one**), and restart the timer.
3. **ACK received:** compare its value y with **SendBase** (the oldest unacknowledged byte). If y > SendBase, the ACK acknowledges one or more previously unacknowledged segments, so update SendBase and restart the timer if any unacknowledged segments remain.

**Scenarios worth knowing:**
- **Lost ACK:** A's segment arrives at B but B's ACK is lost. A times out and resends; B recognizes the duplicate by its sequence number and discards it.
- **Premature timeout:** both ACKs are delayed; A resends the first segment only, and the later cumulative ACK covers both.
- **Cumulative ACK avoids retransmission:** the ACK for the first segment is lost but the ACK for the second arrives before the timeout, so A knows both arrived and resends nothing.

**TCP receiver ACK generation rules:**
- In-order segment arrives, all earlier data already ACKed: **delayed ACK**. Wait up to 500 ms for another in-order segment; if none arrives, send the ACK.
- In-order segment arrives while another in-order segment is waiting to be ACKed: **immediately send one cumulative ACK** for both.
- **Out-of-order segment** arrives (a gap is detected): **immediately send a duplicate ACK** for the next expected byte.
- A segment arrives that partly or fully fills a gap: **immediately send an ACK**.

**Fast retransmit:**
- Timeouts can be long, delaying recovery.
- A **duplicate ACK** re-acknowledges a segment the sender already got an ACK for; it means the receiver got a later segment out of order, so a gap exists, probably from a lost segment.
- If the sender gets **three duplicate ACKs** for the same data, it takes this as a strong sign that the segment after the ACKed one was lost, and **retransmits it immediately**, without waiting for the timer to expire.

**Is TCP Go-Back-N or Selective Repeat?** A **hybrid**:
- Like GBN, it uses cumulative ACKs and keeps only SendBase and NextSeqNum.
- Unlike GBN, it buffers out-of-order segments and retransmits only one segment on a timeout.
- **Selective acknowledgment (SACK)**, a common TCP option, lets the receiver acknowledge out-of-order segments individually, making TCP even more like Selective Repeat.

### Flow control
- Each side keeps a **receive buffer**. If the app reads data slowly and the sender sends fast, the buffer could **overflow**.
- **Flow control** is a speed-matching service: it matches the sender's rate to the rate at which the **receiving application** is reading. (Not to be confused with **congestion control**, which throttles the sender because of **network** congestion.)
- The receiver keeps a variable called the **receive window (rwnd)**, the amount of spare room in its buffer:
  **rwnd = RcvBuffer − (LastByteRcvd − LastByteRead)**
- The receiver puts the current rwnd value in the **receive window field** of every segment it sends.
- The sender keeps the amount of unacknowledged data at or below rwnd:
  **LastByteSent − LastByteAcked ≤ rwnd**
- **Edge case:** if rwnd becomes 0, the sender stops. But if the receiver has no data to send back, it would never tell the sender that space has freed up. TCP's fix: when rwnd = 0, the sender keeps sending segments with **one data byte**, which the receiver acknowledges; eventually an ACK reports a nonzero rwnd.
- UDP has no flow control: segments that arrive to a full socket buffer are simply dropped.

### TCP connection management
**Opening a connection: the three-way handshake**
1. The client sends a **SYN segment**: no application data, **SYN bit = 1**, and a randomly chosen initial sequence number **client_isn**.
2. The server allocates buffers and variables and replies with a **SYNACK segment**: SYN = 1, acknowledgment field = client_isn + 1, and the server's own initial sequence number **server_isn**. In effect: "I got your request to open a connection with initial number client_isn. I agree; my initial sequence number is server_isn."
3. The client allocates its own buffers and variables, and sends a segment acknowledging the SYNACK (acknowledgment = server_isn + 1, **SYN = 0**). This third segment **may carry application data**.

**Closing a connection**
- Either side can end it. The client sends a segment with the **FIN bit = 1**; the server ACKs it, then sends its own FIN; the client ACKs that.
- After acknowledging the server's FIN, the client enters the **TIME_WAIT** state and waits (typically 30 seconds, 1 minute or 2 minutes) so it can resend the final ACK if it was lost, then the connection formally closes and resources are released.
- The book shows the TCP **state diagrams**: the client goes CLOSED → SYN_SENT → ESTABLISHED → FIN_WAIT_1 → FIN_WAIT_2 → TIME_WAIT → CLOSED; the server goes CLOSED → LISTEN → SYN_RCVD → ESTABLISHED → CLOSE_WAIT → LAST_ACK → CLOSED.

**Other cases**
- If a host receives a TCP SYN for a port with no listening socket, it replies with a **RST** (reset) segment. For UDP, the host sends a special ICMP datagram instead.
- **SYN flood attack:** an attacker sends many SYN segments without completing the handshake, so the server allocates resources for many half-open connections and runs out. Defense: **SYN cookies**. The server doesn't allocate resources when it gets a SYN; instead it creates its initial sequence number as a hash of the source and destination addresses and ports plus a secret number (the cookie). Only when a legitimate ACK comes back with a matching value does the server create the connection.
- **nmap** uses responses to identify open ports: a SYNACK means an app is listening on that port (open), an RST means the port is closed, and no response probably means a firewall blocked it.

## 3.6 Principles of Congestion Control

Packet loss usually happens because router **buffers overflow** when the network is congested. Retransmitting fixes the symptom (lost packets) but not the cause (too many sources sending too fast). Congestion control means throttling senders.

### Causes and costs of congestion (three scenarios)
- **Scenario 1: two senders, a router with infinite buffers.** Two hosts each send at rate λin through a router to a shared link of capacity R. Throughput per connection can't exceed **R/2**, and as the sending rate approaches R/2, **queuing delay grows toward infinity**.
  - **Cost:** large queuing delays as the arrival rate approaches the link capacity.
- **Scenario 2: two senders, a router with finite buffers.** Packets get dropped when buffers are full, so senders retransmit. Now the rate the app sends original data (λin) differs from the rate the transport layer sends into the network, **including retransmissions (λ'in, the offered load)**.
  - **Cost:** the sender must retransmit to make up for packets dropped by buffer overflow.
  - **Cost:** **unneeded retransmissions** when a sender times out too early on a packet that was only delayed, which wastes the link carrying a copy nobody needs.
- **Scenario 3: four senders, routers with finite buffers, multihop paths.** As offered load increases, traffic that has already traveled through upstream routers gets dropped at a congested downstream router, competing with traffic that entered there first. At very high loads, the throughput of some connections can drop toward **zero**.
  - **Cost:** when a packet is dropped along a path, the transmission capacity used at each **upstream** link to carry it there is **wasted**.

### Approaches to congestion control
- **End-to-end congestion control:** the network layer gives **no explicit help** to the transport layer. End systems must **infer** congestion from what they observe, like packet loss (timeouts or triple duplicate ACKs) and increasing delays. This is TCP's traditional approach, since IP gives no congestion feedback.
- **Network-assisted congestion control:** routers give **explicit feedback** to senders and/or receivers about the network's congestion state, which can be as simple as a single bit indicating congestion or as detailed as the exact rate a router can support. Feedback can go directly from a router to the sender (a **choke packet**) or the router can mark a passing packet so the receiver tells the sender. Newer TCP versions can use **ECN (Explicit Congestion Notification)** and delay-based approaches (Section 3.7).

## 3.7 TCP Congestion Control

TCP limits its sending rate based on **perceived network congestion**. Three questions: how does a sender limit its rate, how does it detect congestion, and what algorithm changes the rate?

### How TCP limits its rate: the congestion window
- The sender keeps an extra variable, the **congestion window (cwnd)**.
- The amount of unacknowledged data must stay within the minimum of cwnd and rwnd:
  **LastByteSent − LastByteAcked ≤ min{cwnd, rwnd}**
- Ignoring rwnd and loss, the sender's rate is roughly **cwnd / RTT bytes per second**, so adjusting cwnd adjusts the sending rate.
- TCP is **self-clocking**: arriving ACKs trigger (clock) increases in cwnd. If ACKs come back slowly (a congested path), cwnd grows slowly; if they come back quickly, it grows quickly.

### How TCP detects congestion
A "loss event" is either a **timeout** or the receipt of **three duplicate ACKs**. When excessive congestion occurs, router buffers overflow and datagrams get dropped, so the sender sees loss events.

### Guiding principles
- A **lost segment implies congestion**, so the sender's rate should be **decreased**.
- An **acknowledged segment** means the network is delivering segments, so the sender's rate can be **increased** when an ACK arrives for previously unacknowledged data.
- **Bandwidth probing:** keep increasing the rate as ACKs arrive until a loss event happens, then back off and start probing again. There's no explicit signal of the right rate; each sender acts on local information.

### The TCP congestion-control algorithm (three parts)
1. **Slow start**
   - When a connection begins, cwnd starts small, typically **1 MSS**, so the initial rate is about MSS/RTT.
   - cwnd increases by **1 MSS for every ACK** received. That means cwnd **doubles every RTT**: exponential growth (1, 2, 4, 8 MSS…). So "slow start" actually starts slow but grows fast.
   - Slow start ends when:
     - a **timeout** happens: set **ssthresh = cwnd/2**, reset **cwnd = 1 MSS** and start slow start again;
     - cwnd reaches **ssthresh** (the slow-start threshold): switch to **congestion avoidance**;
     - **three duplicate ACKs** are detected: do a fast retransmit and enter **fast recovery**.
2. **Congestion avoidance**
   - Once cwnd reaches ssthresh, TCP grows more cautiously: by about **1 MSS per RTT** (linear growth). Commonly the sender increases cwnd by **MSS·(MSS/cwnd)** bytes for each new ACK.
   - On a **timeout**: ssthresh = cwnd/2, cwnd = 1 MSS, back to slow start.
   - On **triple duplicate ACK**: the network is still delivering some segments, so the reaction is milder: **ssthresh = cwnd/2, cwnd = ssthresh + 3 MSS** (the 3 accounts for the duplicate ACKs), and enter **fast recovery**.
3. **Fast recovery**
   - cwnd increases by 1 MSS for every duplicate ACK received for the missing segment.
   - When the ACK for the missing segment arrives, TCP enters **congestion avoidance** after deflating cwnd (back to ssthresh).
   - If a timeout happens, it goes to slow start (ssthresh = cwnd/2, cwnd = 1 MSS).
   - Fast recovery is recommended but not required. **TCP Tahoe** (an early version) always cut cwnd to 1 MSS and went to slow start after any loss. **TCP Reno** added fast recovery.

### AIMD: Additive Increase, Multiplicative Decrease
- Ignoring slow start (which is short) and assuming losses are signaled by triple duplicate ACKs, TCP's behavior is: **increase cwnd linearly by 1 MSS per RTT** and **halve cwnd on loss**.
- This gives the classic **"sawtooth" graph** of cwnd over time.
- AIMD was proven to be **fair** and to converge, and it's the basis for TCP Reno.

### TCP CUBIC
- Insight: if the bottleneck link's state hasn't changed much, it's better to ramp back up quickly to the sending rate where loss occurred (W_max), and then probe cautiously near it.
- CUBIC increases cwnd as a **cubic function** of the time since the last loss: it grows quickly when far from W_max, slowly when close to it, and then grows quickly again past it, to probe for a new operating point.
- CUBIC is the **default TCP version in Linux** and is very widely used by web servers.

### Average throughput of a TCP Reno connection
If W is the window size (bytes) when a loss occurs and RTT stays about the same, the rate swings between W/(2·RTT) and W/RTT, so:
**average throughput ≈ 0.75 · W / RTT**
A more detailed formula relates throughput to the loss rate L: **throughput ≈ 1.22 · MSS / (RTT · √L)**. The book's example: to get 10 Gbps with 1500-byte segments and a 100 ms RTT, the loss rate must be extremely low (about 2×10^-10, one loss per 5 billion segments), which shows why new TCP versions are needed for high-speed networks.

### Network-assisted congestion control: ECN
- **ECN (Explicit Congestion Notification):** two bits in the **IP header's** Type-of-Service field.
- A congested router sets an ECN bit in a datagram passing through. The receiver sees it and sets the **ECE (Explicit Congestion notification Echo)** bit in its TCP ACK back to the sender. The sender reacts as if it had a fast-retransmit loss (halves cwnd) and sets the **CWR (Congestion Window Reduced)** bit in its next segment.
- Benefit: congestion is signaled **before** packets have to be dropped.

### Delay-based congestion control
- Instead of waiting for loss, the sender watches the RTT. It measures the **minimum RTT** (RTT_min, the RTT when the path isn't congested); the uncongested throughput is cwnd/RTT_min.
- If the measured throughput is close to cwnd/RTT_min, the path isn't congested and cwnd can grow. If it's much lower, the path is congested and cwnd should shrink.
- Goal: **keep the pipe just full, but no fuller**, keeping the bottleneck busy without building up big queues. **TCP Vegas** is an early example; Google's **BBR** is a modern delay-based protocol used on its internal network and many servers.

### Fairness
- A congestion-control mechanism is **fair** if K TCP connections sharing a bottleneck link of rate R each end up with an average rate of about **R/K**.
- **Why AIMD is fair:** picture the throughput of two connections on a graph. Additive increase moves both up along a 45° line, while multiplicative decrease halves both, pulling the point toward the line of equal shares. Over time they converge to sharing the link equally.
- In practice it isn't perfectly fair: connections with **smaller RTTs** grab bandwidth faster and get more.
- **Fairness and UDP:** UDP apps (like some streaming or real-time apps) don't use congestion control, so they can crowd out TCP traffic.
- **Fairness and parallel TCP connections:** an app can open many parallel connections (as web browsers do) and get a bigger share. Example: a link of rate R with 9 existing connections; a new app opening 11 connections gets more than R/2.

## 3.8 Evolution of Transport-Layer Functionality

- TCP and UDP have been the Internet's main transport protocols for decades, but there are now many TCP variants (Tahoe, Reno, CUBIC, Vegas, BBR, and versions tuned for data centers, wireless links, etc.). The common thread: TCP's API and reliable byte-stream service stayed the same while its internals evolved.
- **QUIC (Quick UDP Internet Connections):**
  - An **application-layer protocol** built on top of **UDP**, designed to improve the performance of transport for secure HTTP. It's used by Google, and it underpins **HTTP/3**.
  - **Connection-oriented and secure:** it combines connection setup with **authentication and encryption** handshakes (similar to TLS) into **a single handshake**, saving round trips compared with TCP + TLS (which take several).
  - **Streams:** multiple application-level streams can be multiplexed over a single QUIC connection. Each stream has its own reliable, in-order delivery, so **a lost packet blocks only the stream it belongs to**, which avoids the head-of-line blocking HTTP/2 suffers over TCP.
  - **Reliable, congestion-controlled data transfer:** uses acknowledgment and retransmission mechanisms similar to TCP's, and congestion control based on TCP NewReno.
  - Because QUIC is implemented in the **application**, it can be updated as fast as apps are, instead of waiting for operating-system kernel updates.

## Key terms
- **Multiplexing / demultiplexing:** combining data from sockets / delivering segments to the right socket.
- **Port number:** identifies a socket on a host; 0–1023 are well-known.
- **UDP:** connectionless, unreliable, 8-byte header, checksum only.
- **Checksum:** one's-complement sum used to detect bit errors.
- **ARQ:** error detection + feedback + retransmission.
- **Stop-and-wait:** send one packet, wait for its ACK.
- **Alternating-bit protocol:** rdt3.0, using sequence numbers 0 and 1.
- **Pipelining:** sending multiple packets before receiving ACKs.
- **Go-Back-N:** cumulative ACKs; resend everything after a timeout.
- **Selective Repeat:** individual ACKs; resend only lost packets; window ≤ half the sequence space.
- **MSS / MTU:** max app data per segment / max link-layer frame size.
- **Sequence number / ACK number:** first byte in the segment / next byte expected.
- **EstimatedRTT, DevRTT, TimeoutInterval:** how TCP sets its timeout.
- **Fast retransmit:** resend after 3 duplicate ACKs.
- **Flow control / rwnd:** don't overflow the receiver's buffer.
- **Three-way handshake:** SYN, SYNACK, ACK.
- **SYN flood / SYN cookies:** attack / defense.
- **cwnd / ssthresh:** congestion window / slow-start threshold.
- **Slow start, congestion avoidance, fast recovery:** TCP's three congestion-control phases.
- **AIMD:** additive increase, multiplicative decrease.
- **CUBIC, BBR, Vegas:** TCP variants.
- **ECN:** routers mark packets to signal congestion.
- **QUIC:** secure, reliable, multiplexed transport built on UDP; used by HTTP/3.

## Quick review
- Know UDP's 2-tuple vs. TCP's 4-tuple demultiplexing.
- Walk through rdt1.0 → 2.0 → 2.1/2.2 → 3.0, and what problem each version fixes.
- Compute stop-and-wait utilization: (L/R) / (RTT + L/R).
- Compare GBN and SR: ACK types, timers, buffering, what gets retransmitted.
- Compute EstimatedRTT, DevRTT and TimeoutInterval.
- Trace cwnd through slow start, congestion avoidance, a triple duplicate ACK and a timeout.
- Explain why AIMD converges to fairness.
