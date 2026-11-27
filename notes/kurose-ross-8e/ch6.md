# Chapter 6: The Link Layer and LANs

The network layer moves datagrams end to end across many links; the **link layer** is responsible for moving a datagram **across a single link**, from one node to the next. This chapter covers the services the link layer provides, how errors are detected and corrected, how many devices share a single broadcast channel (multiple access protocols), how switched local area networks (Ethernet, switches, ARP, VLANs) work, MPLS, data center networks, and finally ties the whole book together by tracing everything that happens when you load a web page.

## 6.1 Introduction to the Link Layer

### Terminology
- **Node:** any device that runs a link-layer protocol: hosts, routers, switches and WiFi access points.
- **Link:** a communication channel connecting adjacent nodes along a path.
- A datagram from source to destination travels over a series of individual links; over each link, a transmitting node **encapsulates** the datagram in a **link-layer frame** and sends it.
- Different links can use different link-layer protocols. A datagram might go over WiFi for the first link, Ethernet for the second, and a wide-area link after that.
- **Travel agent analogy:** a trip from Princeton to Lausanne uses a limo (Princeton to JFK), a plane (JFK to Geneva) and a train (Geneva to Lausanne). The **tourist** is the datagram, each **transport segment** is a link, the **transportation mode** is the link-layer protocol and the **travel agent** is the routing protocol.

### Services the link layer can provide
- **Framing:** almost all link-layer protocols encapsulate each datagram in a **frame**, with a data field (the datagram) and header fields.
- **Link access:** a **MAC (Medium Access Control)** protocol sets the rules for transmitting a frame onto the link. Point-to-point links are simple; for shared broadcast links, the MAC protocol coordinates many nodes (the **multiple access problem**).
- **Reliable delivery:** guarantees moving each datagram across the link without error, using acknowledgments and retransmissions like TCP. Often used on links with high error rates (like **wireless**), to fix errors locally instead of forcing end-to-end retransmission. Usually considered unnecessary overhead on low-error links like fiber, coax and many twisted-pair links, so many wired link-layer protocols don't provide it.
- **Error detection and correction:** detects bit errors caused by signal attenuation and electromagnetic noise. Done in **hardware** and more sophisticated than the Internet checksum. Some protocols can also **correct** errors.

### Where is the link layer implemented?
- Mostly in a **network adapter**, also called a **network interface controller (NIC)**: a chip that implements framing, link access, error detection, etc. Most of the work is done in **hardware**.
- Part of it is in **software** on the host's CPU: assembling link-layer addressing information, activating the controller hardware, and responding to interrupts (like receiving frames, handling errors and passing datagrams up to the network layer).
- The link layer is where **software meets hardware** in the protocol stack.

## 6.2 Error-Detection and -Correction Techniques

- The sender adds **error-detection and -correction bits (EDC)** to the data D. The receiver gets D′ and EDC′ (which may differ from the originals if bits flipped) and checks them.
- Even with these bits, there's always a chance of **undetected bit errors**. Stronger techniques have a smaller chance, but more overhead.

### Parity checks
- **Single parity bit:** the sender adds one bit so the total number of 1s (data plus parity bit) is even (**even parity**) or odd (**odd parity**).
- The receiver counts the 1s. With even parity, an odd count means an error.
- Problem: it can only detect an **odd number of bit errors**. If an even number of bits flip, the error goes undetected. And errors often come in **bursts**, which makes undetected errors likely.
- **Two-dimensional parity:** the data is arranged in a grid of i rows and j columns, and a parity bit is computed for each row and column (plus one for the corner).
  - A **single bit error** causes a parity error in exactly one row and one column, which pinpoints the bit, so the receiver can **detect and correct** it.
  - It can **detect** (but not correct) any combination of two errors.
- **Forward error correction (FEC):** the receiver's ability to both detect and correct errors without asking the sender to retransmit. Used in audio storage and playback (CDs) and in wireless. It reduces the number of retransmissions needed and avoids waiting a round-trip for a retransmission, which helps real-time apps and long-delay links.

### Checksumming methods
- Like the Internet checksum (Chapter 3): treat the data as a sequence of k-bit integers, add them up and use the result (one's complement of the sum) as the error-detection bits.
- Needs relatively little overhead, but provides fairly **weak** protection compared with CRC.
- Why do the transport layer use checksums but the link layer use CRC? Transport-layer error detection is done in **software**, so it must be simple and fast; link-layer detection is done in **dedicated hardware**, which can quickly perform the more complex CRC operations.

### Cyclic Redundancy Check (CRC)
- CRC codes (also called **polynomial codes**) are widely used in today's networks (Ethernet, WiFi).
- **Setup:**
  - The data to send is D, a d-bit number.
  - The sender and receiver agree on an **(r+1)-bit pattern G**, the **generator**. The most significant (leftmost) bit of G must be 1.
  - The sender chooses **r additional bits R** and appends them to D, so that the resulting (d+r)-bit pattern is **exactly divisible by G** using **modulo-2 arithmetic**.
  - The receiver divides the (d+r) received bits by G. If the **remainder is nonzero**, an error has occurred; otherwise the data is accepted as correct.
- **Modulo-2 arithmetic:** addition and subtraction are both just **XOR**, with no carries or borrows. Multiplying by 2^k is a left shift by k bits.
- **How to compute R:** we want D·2^r XOR R = nG (a multiple of G). XOR-ing R on both sides: D·2^r = nG XOR R. So **R is the remainder of dividing D·2^r by G**:
  **R = remainder( D · 2^r / G )**
- **Worked example:** D = 101110, d = 6, G = 1001, r = 3. Append three zeros to D (giving 101110000), then divide by 1001 with modulo-2 long division. The remainder is **R = 011**, so the sender transmits **101110011**.
- International standards define 8-, 12-, 16- and 32-bit generators. The 32-bit standard **CRC-32** is used in many link-layer protocols (including Ethernet).
- **Error-detection power:**
  - A CRC with an r+1-bit generator can detect **all burst errors of fewer than r+1 bits** (all consecutive bit errors of r bits or fewer).
  - Under appropriate assumptions, a burst longer than r+1 bits is detected with probability **1 − 0.5^r**.
  - It can also detect any odd number of bit errors.

## 6.3 Multiple Access Links and Protocols

### Two types of links
- **Point-to-point link:** a single sender at one end and a single receiver at the other. Examples: PPP (point-to-point protocol), a link between an Ethernet switch and a host.
- **Broadcast link:** multiple sending and receiving nodes all connected to the **same, single, shared broadcast channel**. When any node sends a frame, the channel broadcasts it and **every other node receives a copy**. Examples: Ethernet (the original shared-bus version), wireless LANs, satellite.

### The multiple access problem
- How do you coordinate access of multiple sending and receiving nodes to a shared broadcast channel? This is the job of **multiple access protocols**.
- Human analogy: a classroom, where people take turns speaking.
- If two or more nodes transmit at the same time, their signals mix and all the frames involved are lost. This is a **collision**, and while it happens, the channel's capacity is wasted.

### What we'd like from a multiple access protocol (on a channel of rate R bps)
1. When only **one node** has data to send, it gets the full throughput of **R bps**.
2. When **M nodes** have data to send, each gets an average throughput of **R/M bps** (over some suitably defined interval).
3. The protocol is **decentralized**: there's no master node that could fail and bring down the whole system.
4. The protocol is **simple**, so it's cheap to implement.

### Three broad classes of multiple access protocols

**1. Channel partitioning protocols**
- **TDM (time-division multiplexing):** time is divided into **frames**, each frame into **N time slots**; each slot goes to one of the N nodes. Each node gets a dedicated rate of **R/N** bps during each frame time.
  - Advantages: **eliminates collisions** and is perfectly fair.
  - Drawbacks: a node is limited to R/N even when it's the **only** node with data to send; a node must always wait for its turn, even if it's the only one with frames to send.
- **FDM (frequency-division multiplexing):** the R bps channel is divided into **different frequencies**, each with bandwidth R/N, and each frequency goes to one of the N nodes. Same pros and cons as TDM: no collisions, fair, but a node is limited to R/N even when it's the only active node.
- **CDMA (code division multiple access):** assigns each node a different **code**. Each node uses its unique code to encode the data bits it sends. With carefully chosen codes, nodes can **transmit simultaneously** and receivers can still correctly receive a sender's bits despite interference from other nodes' transmissions. It's used in military systems and cellular telephony (covered in Chapter 7).

**2. Random access protocols**
- A transmitting node **always transmits at the full channel rate R**.
- When there's a collision, each node involved **repeatedly retransmits** its frame until it gets through without a collision. But it doesn't retransmit right away; it waits a **random delay** first, with each node choosing independently. With luck, one node's delay will be shorter than the others', so it can sneak its frame in.
- **Slotted ALOHA:**
  - Assumptions: all frames are exactly L bits; time is divided into **slots** of size L/R (one frame's transmission time); nodes start transmitting only at the **beginning of slots**; nodes are synchronized; if two or more frames collide in a slot, all nodes detect the collision before the slot ends.
  - Operation: when a node has a fresh frame, it waits until the beginning of the next slot and sends the whole frame. If there's **no collision**, the frame was sent successfully. If there's a **collision**, the node retransmits the frame in each subsequent slot with **probability p** until it gets through without a collision.
  - Pros: a single active node can send continuously at full rate R; highly **decentralized** (each node detects collisions and decides when to retransmit independently); simple.
  - Cons: collisions waste slots; some slots are **empty** (no node transmits) because of the probabilistic policy; clock synchronization is needed.
  - **Efficiency:** the long-run fraction of successful slots when there are many active nodes. With N active nodes each transmitting with probability p, a slot is successful with probability **N·p·(1−p)^(N−1)**. Maximizing over p and letting N go to infinity gives a maximum efficiency of **1/e ≈ 0.37**. So at best, the channel is used for successful transmissions only **37%** of the time.
- **Pure (unslotted) ALOHA:** the original, fully decentralized ALOHA. When a frame first arrives, the node **immediately** transmits it in its entirety. If it collides, the node immediately (after completing transmission of the collided frame) retransmits with probability p, or waits a frame time. There are no slots, so a frame can collide with frames sent within a **window twice as large**. Maximum efficiency is **1/(2e) ≈ 0.18**, exactly half of slotted ALOHA.
- **CSMA (Carrier Sense Multiple Access):** two important rules from human conversation:
  - **Listen before speaking (carrier sensing):** a node listens to the channel before transmitting. If a frame from another node is currently being sent, the node waits until it detects no transmissions for a short time, then begins.
  - **If someone else begins talking at the same time, stop talking (collision detection):** see CSMA/CD below.
  - Why do collisions still happen with carrier sensing? Because of **channel propagation delay**: it takes time for a signal to travel from one node to another along the channel. A node may start transmitting before it has "heard" that another node has already begun. The longer the propagation delay, the more likely this is.
- **CSMA/CD (CSMA with Collision Detection):**
  - A node listens while it transmits. If it detects energy from another transmission (a collision) during its own, it **aborts** its transmission (stops sending the rest of the useless frame), which saves channel time.
  - Steps:
    1. The adapter gets a datagram from the network layer, prepares a frame and puts it in its buffer.
    2. If it senses the channel is **idle**, it starts transmitting. If it senses the channel is **busy**, it waits until it's idle, then transmits.
    3. While transmitting, it monitors for signal energy from other adapters.
    4. If it transmits the whole frame without detecting other energy, it's done. If it detects energy from another adapter during transmission, it **aborts**.
    5. After aborting, it waits a **random amount of time**, then returns to step 2.
  - **Binary exponential backoff:** how long should the random wait be? After experiencing the **n-th collision** for a frame, the adapter chooses K at random from **{0, 1, 2, …, 2^n − 1}**, and waits K times the time needed to send 512 bits (for Ethernet). So the range of possible waits doubles with each collision, up to a maximum (n stops growing at 10). With few colliding nodes, the interval stays small; with many, it grows large, reducing the chance of repeated collisions.
  - **Efficiency of CSMA/CD:** the long-run fraction of time frames are transmitted without collisions when many nodes have lots of frames to send:
    **Efficiency = 1 / (1 + 5·d_prop / d_trans)**
    where d_prop is the maximum propagation time between any two adapters and d_trans is the time to transmit a maximum-size frame. As **d_prop approaches 0**, efficiency approaches 1 (collisions are detected immediately and waste no time); as **d_trans becomes very large**, efficiency approaches 1 too (a frame holding the channel for a long time does a lot of productive work). It's much better than ALOHA.

**3. Taking-turns protocols**
These aim for property 2 (R/M per active node) as well as property 1.
- **Polling protocol:** one node is the **master**, which polls each node in turn (round-robin), telling it the maximum number of frames it can send. Example: Bluetooth.
  - Pros: no collisions or empty slots, so much higher efficiency.
  - Cons: **polling delay** (the time to notify a node it can transmit); if only one node is active, it sends at less than R, because the master must poll each inactive node every cycle. And if the **master fails**, the whole channel stops working.
- **Token-passing protocol:** no master. A small special frame called a **token** is passed among the nodes in a fixed order. A node holding the token keeps it only if it has frames to send; otherwise it passes the token immediately to the next node. If it does have frames, it sends up to a maximum number, then passes the token on.
  - Pros: decentralized and highly efficient.
  - Cons: the failure of **one node** can crash the whole channel; if a node accidentally fails to release the token, a recovery procedure is needed. Examples: FDDI, IEEE 802.5 token ring.

### DOCSIS: the link-layer protocol for cable Internet access
DOCSIS combines all three classes:
- **FDM:** the downstream and upstream cable channels are divided into frequency channels. Each downstream channel is 24–192 MHz wide (up to about 1.6 Gbps); each upstream channel is 6.4–96 MHz wide (up to about 1 Gbps).
- **Downstream:** only one sender, the **CMTS** at the cable head end, so there's no multiple access problem.
- **Upstream:** multiple cable modems share the same upstream channel, so collisions could occur. The channel is divided into intervals of time (**TDM-like**), each with a sequence of **mini-slots** during which modems can transmit.
  - The CMTS explicitly **grants** permission to individual modems to transmit during specific mini-slots, by sending a control message called a **MAP message** on a downstream channel (taking-turns style).
  - Modems request mini-slots by sending **mini-slot-request frames** during special intervals of mini-slots set aside for that purpose. These request frames are sent in **random access** fashion and can collide; a modem can't detect collisions directly, so it assumes one happened if it doesn't receive a response in the next downstream control message, and uses **binary exponential backoff** to retry.

## 6.4 Switched Local Area Networks

Switched LANs connect hosts with **link-layer switches**. Since switches operate at the link layer, they **switch link-layer frames** (not datagrams), don't recognize network-layer addresses, and don't use routing algorithms like OSPF; they use link-layer addresses instead.

### Link-layer addressing and ARP

**MAC addresses**
- Hosts and routers don't have link-layer addresses; their **adapters (network interfaces)** do. A host or router with multiple interfaces has multiple link-layer addresses (as it has multiple IP addresses).
- Link-layer switches do **not** have link-layer addresses associated with the interfaces that connect to hosts and routers. A switch's job is to carry datagrams between hosts and routers **transparently**: hosts and routers don't have to explicitly address frames to the switch.
- A link-layer address is called a **LAN address**, **physical address** or **MAC address**. For most LANs (Ethernet, 802.11) it's **6 bytes (48 bits)** long, giving 2^48 possible addresses, typically written in **hexadecimal** with each byte as a pair of hex digits (e.g., `1A-23-F9-CD-06-9B`).
- MAC addresses are supposed to be **permanent** (burned into the adapter's ROM, although software can now change them) and **unique**. The **IEEE** manages the MAC address space: a company buys a chunk of 2^24 addresses, IEEE fixes the first 24 bits and the company creates unique combinations of the last 24 bits.
- **Flat structure:** a MAC address has a flat structure (as opposed to a hierarchical one like IP) and **doesn't change no matter where the adapter goes**. A laptop's Ethernet adapter always has the same MAC address, but its IP address changes when it moves to a different network.
  - Analogy: a MAC address is like a person's **social security number** (flat, doesn't change), while an IP address is like a **postal address** (hierarchical, changes when you move).
- When an adapter wants to send a frame to a destination adapter, it puts the destination's MAC address in the frame. When an adapter receives a frame, it checks whether the destination MAC address matches its own: if it does, it extracts the datagram and passes it up the stack; if not, it **discards** the frame.
- **Broadcast MAC address:** `FF-FF-FF-FF-FF-FF` (all 48 bits are 1s). A frame sent there is received and processed by **all** adapters on the LAN.

**Why have both MAC and IP addresses?**
- LANs are designed for arbitrary network-layer protocols, not just IP. If adapters used IP addresses instead of MAC addresses, they couldn't easily support other network-layer protocols.
- If adapters used the network-layer address (stored in RAM and reconfigured every time the adapter moved) instead of a fixed one, they'd have to be reconfigured constantly.
- Without addresses, every adapter would pass every frame up the stack, and the host would be interrupted by every frame on the LAN, even ones meant for other nodes.
- So the layers are kept **largely independent**.

**ARP (Address Resolution Protocol)**
- Translates between **network-layer addresses (IP)** and **link-layer addresses (MAC)**.
- Analogy: DNS resolves hostnames to IP addresses for any host anywhere in the Internet; ARP resolves IP addresses only for hosts and router interfaces **on the same subnet**.
- Each host and router has an **ARP table** in memory, with mappings of IP addresses to MAC addresses. Each entry also has a **TTL** (typically 20 minutes), after which it's deleted.
- **How ARP works (sender doesn't have an entry for the destination):**
  1. The sender builds an **ARP query packet** with the sender's and receiver's IP and MAC addresses. Its purpose is to ask all the other hosts and routers on the subnet for the MAC address of the interface with the given IP address.
  2. The sender's adapter puts the ARP packet in a link-layer frame, addressed to the **broadcast address** (FF-FF-FF-FF-FF-FF), and sends it into the subnet. Every adapter on the subnet receives it and passes the ARP packet up to its ARP module.
  3. Each ARP module checks whether its IP address matches the destination IP in the query. The one with a match sends back an **ARP response packet** with the desired mapping, in a **standard (unicast) frame** to the querying node.
  4. The querying node updates its ARP table and can now send its IP datagram, encapsulated in a link-layer frame addressed to the destination's MAC address.
- ARP is **plug-and-play**: tables are built automatically, without a system administrator.
- Is ARP a link-layer or network-layer protocol? It's best thought of as **straddling the boundary**: an ARP packet is encapsulated in a link-layer frame, but it contains both link-layer and network-layer addresses.

**Sending a datagram off the subnet**
- Example: host 111.111.111.111 on subnet 1 wants to send to host 222.222.222.222 on subnet 2, with a router connecting them. The router has an interface on each subnet, each with its own IP and MAC address.
- The sending host can't put the destination host's MAC address in the frame, because no adapter on subnet 1 would match it. Instead, it addresses the frame to the MAC address of the **first-hop router's interface on subnet 1** (it gets that address via ARP, using the router's IP address, which it knows from DHCP's default gateway setting).
- The router receives the frame, passes the datagram up to its network layer, consults its forwarding table to find the right outgoing interface (subnet 2), uses ARP on subnet 2 to get the destination host's MAC address, then puts the datagram in a new frame addressed to the destination host's MAC address.
- Key point: the **IP addresses in the datagram stay the same end to end**, while the **MAC addresses change at each link**.

### Ethernet
Ethernet has pretty much taken over the wired LAN market. Reasons: it was the first widely deployed high-speed LAN; competing technologies (token ring, FDDI, ATM) were more complex and expensive; it kept getting faster (from 10 Mbps to 400 Gbps); and Ethernet hardware became very cheap.

**Evolution:**
- The original Ethernet LAN (1970s) used a **coaxial bus** to connect the nodes: a **broadcast LAN**, where every frame is processed by all adapters connected to the bus, using CSMA/CD.
- By the late 1990s, most companies and universities had replaced their LANs with Ethernet installations using a **hub-based star topology**. A **hub** is a **physical-layer** device that acts on individual bits rather than frames: when a bit arrives on one interface, it recreates the bit, boosts its energy and sends it out on **all** the other interfaces. Still a broadcast LAN, still collisions.
- In the early 2000s, Ethernet changed again: still a star topology, but the hub at the center was replaced with a **switch**. A switch is **"collision-less"** and is a bona fide **store-and-forward packet switch** working only up to layer 2.

**Ethernet frame structure** (fields, in order):
- **Preamble (8 bytes):** the first 7 bytes are `10101010` and the last is `10101011`. They "wake up" the receiving adapters and synchronize their clocks to the sender's. The two 1s at the end of the eighth byte signal that the important content is coming.
- **Destination address (6 bytes):** the MAC address of the destination adapter. If an adapter receives a frame with its own address or the broadcast address, it passes the data up; otherwise it discards the frame.
- **Source address (6 bytes):** the MAC address of the adapter that sends the frame onto the LAN.
- **Type field (2 bytes):** lets Ethernet **multiplex** network-layer protocols, saying which protocol the data should go to (for example, IP, ARP or others). Analogous to the protocol field in IP datagrams and port numbers in transport segments.
- **Data field (46 to 1,500 bytes):** carries the IP datagram. The **MTU of Ethernet is 1,500 bytes**; a larger datagram must be fragmented. The minimum is 46 bytes; shorter data is "stuffed" (padded) to 46 bytes, and the network layer uses the IP datagram's length field to remove the padding.
- **CRC (4 bytes):** lets the receiving adapter detect bit errors in the frame.

**Ethernet's service:**
- **Connectionless:** no handshaking between sending and receiving adapters.
- **Unreliable:** the receiving adapter doesn't send ACKs or NAKs. When a frame fails the CRC check, the adapter just **discards** it, and the sender doesn't know. Gaps in the data are left for higher layers to deal with (TCP retransmits; UDP-based apps see the gaps).

**Ethernet technologies:**
- Ethernet comes in many flavors with names like **10BASE-T, 10BASE-2, 100BASE-T, 1000BASE-LX, 10GBASE-T and 40GBASE-T**. The first part is the speed (10 Mbps, 100 Mbps, 1 Gbps, 10 Gbps, 40 Gbps), **BASE** means **baseband** Ethernet (the physical media carries only Ethernet traffic), and the final part refers to the **physical medium** (T = twisted-pair copper wire; others refer to fiber, etc.).
- Early 10BASE-2 and 10BASE-5 used coax buses limited to 500 meters, extended with **repeaters** (physical-layer devices that receive a signal and regenerate it).
- Gigabit Ethernet and above: uses the standard Ethernet frame format; allows point-to-point links (using switches) as well as shared broadcast channels (using hubs); uses CSMA/CD for shared broadcast channels (to get acceptable efficiency, the maximum distance between nodes must be severely limited); and allows **full-duplex** operation at the full rate in both directions for point-to-point links.
- **Important modern point:** in a switch-based Ethernet LAN with full-duplex links, **there are no collisions**, so **there's no need for a MAC protocol** (CSMA/CD isn't needed). The standard **frame format** has remained the same over decades, which is the true unifying feature of Ethernet.

### Link-layer switches
- The switch's role is to **receive incoming link-layer frames and forward them onto outgoing links**.
- The switch itself is **transparent** to hosts and routers: a host or router addresses a frame to another host or router (not to the switch) and sends it into the LAN, unaware that a switch will be receiving and forwarding it.
- Switch output interfaces have **buffers**, because the rate at which frames arrive at an output interface may temporarily exceed its link capacity.

**Forwarding and filtering:**
- **Filtering:** the switch function that decides whether a frame should be forwarded to some interface or just dropped.
- **Forwarding:** the switch function that decides which interfaces a frame should be directed to, and moves it there.
- Both use a **switch table**. Each entry contains (i) a MAC address, (ii) the switch interface that leads toward that MAC address, and (iii) the time the entry was placed in the table.
- When a frame with destination address DD-DD-DD-DD-DD-DD arrives on interface x, the switch indexes its table with that MAC address. Three cases:
  1. **No entry for the address:** the switch **broadcasts** (floods) the frame, forwarding copies to the output buffers of **all interfaces except x**.
  2. **An entry associates the address with interface x** (the frame came from the same LAN segment as the destination): there's no need to forward it to any other interface, so the switch **discards** the frame (**filtering**).
  3. **An entry associates the address with interface y ≠ x:** the frame needs to go to the LAN segment attached to y, so the switch **forwards** it to the output buffer in front of interface y.

**Self-learning:**
- A switch builds its table **automatically, dynamically and autonomously**, without any intervention from a network administrator or configuration protocol. Switches are **self-learning**:
  1. The table starts empty.
  2. For each incoming frame received on an interface, the switch stores in its table (i) the MAC address in the frame's **source address** field, (ii) the interface the frame arrived on, and (iii) the current time. So the switch records which interface each sender is reachable through. If every host eventually sends a frame, every host is eventually recorded.
  3. The switch deletes an address from the table if no frames are received with that address as the source after some period of time (the **aging time**). This way, if a PC is replaced by another one (with a different adapter), the old PC's MAC address is eventually purged.
- Switches are **plug-and-play** devices: they require no intervention from an administrator or user. A network administrator installing a switch only needs to connect the LAN segments to its interfaces.
- Switches are **full-duplex**: any switch interface can send and receive at the same time.

**Properties of link-layer switching (advantages over broadcast links like buses or hubs):**
- **Elimination of collisions:** in a LAN built from switches (and without hubs), there's no wasted bandwidth due to collisions. Switches buffer frames and never transmit more than one frame on a segment at any one time. The maximum aggregate throughput of a switch is the **sum of all its interface rates**.
- **Heterogeneous links:** because a switch isolates one link from another, the different links in the LAN can operate at **different speeds** and run over **different media**.
- **Management:** for example, if an adapter malfunctions and continually sends Ethernet frames (a **jabbering adapter**), a switch can detect it and internally disconnect it. A cut cable disconnects only the host using it. Switches also gather statistics on bandwidth usage, collision rates and traffic types.

**Security: switch poisoning.** In a switched LAN, a host normally only sees frames addressed to it (and broadcast frames), which makes sniffing harder. But an attacker can send tons of packets to the switch with **many different bogus source MAC addresses**, filling the switch table with bogus entries and leaving no room for legitimate hosts' addresses. This causes the switch to **broadcast most frames**, which the attacker's sniffer can then pick up.

**Switches vs. routers**
- Both are store-and-forward packet switches. A **router** forwards using **network-layer (IP) addresses**: it's a **layer-3** packet switch. A **switch** forwards using **MAC addresses**: it's a **layer-2** packet switch.
- **Switches, pros:**
  - **plug-and-play**;
  - relatively high filtering and forwarding rates (only need to process frames up to layer 2).
- **Switches, cons:**
  - to prevent broadcast frames from cycling forever, the active topology of a switched network is restricted to a **spanning tree**;
  - a large switched network needs large ARP tables in hosts and routers and generates lots of ARP traffic and processing;
  - switches aren't protected against **broadcast storms**: if one host goes haywire and sends an endless stream of broadcast frames, the switches forward all of them, causing the whole network to collapse.
- **Routers, pros:**
  - network addressing is hierarchical (not flat), so packets don't normally cycle through routers even when the network has redundant paths, and the topology isn't restricted to a spanning tree; they can use the best path between source and destination;
  - they provide **firewall protection against layer-2 broadcast storms**.
- **Routers, cons:**
  - not plug-and-play (they and the hosts connecting to them need their IP addresses configured);
  - often a larger per-packet processing time, since they must process up through layer 3.
- **Rule of thumb:** small networks with a few hundred hosts typically use **switches**, since they localize traffic and increase throughput without needing IP configuration. Larger networks with thousands of hosts typically include **routers** too, for more robust traffic isolation, control of broadcast storms, and more "intelligent" routes.

### Virtual Local Area Networks (VLANs)
- **Problems with a traditional hierarchical switched LAN** (for example, one switch per department connected to a backbone switch):
  - **Lack of traffic isolation:** broadcast traffic (like ARP and DHCP messages, or frames whose destination isn't yet learned) must still traverse the entire institutional network. Limiting the scope of broadcast traffic would improve performance, and it's often desirable for security/privacy reasons too.
  - **Inefficient use of switches:** an institution with 10 groups that wants each group isolated would need 10 first-level switches, even if each group had only a few people.
  - **Managing users:** if an employee moves between groups, the physical cabling must be changed to connect them to a different switch.
- **VLANs** solve these: a switch that supports VLANs lets **multiple virtual LANs be defined over a single physical LAN infrastructure**. Hosts within a VLAN communicate with each other as if they (and no other hosts) were connected to the switch.
- **Port-based VLAN:** the switch's ports (interfaces) are divided into groups by the network manager, and each group makes up a VLAN, with the ports in each VLAN forming a **broadcast domain** (broadcast traffic from one port can only reach other ports in the group). For example, ports 2–8 for the Electrical Engineering department and ports 9–15 for Computer Science.
- Moving a user to a different group just requires reconfiguring the switch's port assignments in software, not changing cables.
- How does traffic get from one VLAN to another (say, EE to CS)? Connect a VLAN switch port to an external **router** and configure that port to belong to both VLANs. Traffic between VLANs goes through the router, even though both VLANs share one physical switch. Vendors often sell a single device containing both a VLAN switch and a router.
- **VLAN trunking:** to connect VLAN switches in different buildings, a special port on each switch is configured as a **trunk port**, which belongs to **all VLANs**, and frames sent to any VLAN are forwarded over the trunk link to the other switch.
  - How does a switch know which VLAN a frame arriving on a trunk port belongs to? The IEEE defined an extended Ethernet frame format, **802.1Q**, for frames crossing a VLAN trunk. It adds a **4-byte VLAN tag** to the header, carrying the identity of the VLAN the frame belongs to (it consists of a 2-byte Tag Protocol Identifier field and a 2-byte Tag Control Information field with a 12-bit VLAN identifier and a 3-bit priority field). The tag is added by the switch at the sending side of the trunk, and removed by the switch at the receiving side.
- VLANs can also be defined based on MAC addresses or network-layer protocols, not just ports.

## 6.5 Link Virtualization: A Network as a Link Layer

- The book's point here: some "links" that look like a single link to IP are actually **whole networks** in their own right. Earlier, a dial-up telephone network looked to IP like a simple link between two hosts. Now, **MPLS** networks are treated the same way.

### Multiprotocol Label Switching (MPLS)
- MPLS evolved from industry efforts in the late 1990s to improve the forwarding speed of IP routers, by adopting a key concept from virtual-circuit networks: a **fixed-length label**. Instead of looking up the destination IP address with longest-prefix matching, routers forward based on a short label, which can be faster.
- MPLS works hand in hand with IP: it **augments** IP datagram forwarding by **selectively labeling** datagrams and allowing routers to forward based on fixed-length labels (rather than IP addresses) when possible.
- **The MPLS header** is added **between the layer-2 (e.g., Ethernet) header and the layer-3 (IP) header**. Its fields include the **label**, 3 bits reserved for experimental use, a single **S bit** (to indicate the end of a series of "stacked" MPLS headers), and a **TTL** field.
- An MPLS-enhanced frame can only be sent between routers that are both **MPLS-capable** (**label-switched routers**). A label-switched router forwards an MPLS frame by looking up the MPLS label in its forwarding table and immediately passing the datagram to the right output interface, without looking at the IP address.
- Routers learn labels and paths through protocols like **RSVP-TE** (a signaling protocol); MPLS routers learn link bandwidth and other info through extensions to link-state protocols like OSPF.
- **The real advantages of MPLS** go beyond switching speed:
  - **Traffic engineering:** MPLS can forward packets along routes that **wouldn't be possible with standard IP routing** algorithms. With IP, all packets to a destination usually follow the same least-cost path; with MPLS, a network operator can override normal IP routing and force some traffic along one path and other traffic to the same destination along another path (for performance, load balancing or policy).
  - **Fast restoration:** MPLS can be used to quickly reroute traffic onto a precomputed failover path in response to a link failure.
  - **Virtual private networks (VPNs):** an ISP can use MPLS to connect a customer's networks while keeping the customer's VPN resources and addressing **isolated** from other users crossing the ISP's network.

## 6.6 Data Center Networking

- Big companies like Google, Microsoft, Amazon and Alibaba build huge **data centers**, each housing tens to hundreds of thousands of hosts. They support cloud applications (search, email, social networking, e-commerce) and provide computing for cloud customers.
- A data center has its own **data center network** connecting its hosts to each other and to the Internet. Costs in a large data center include the hosts (about 45%), infrastructure like power and cooling (25%), electricity (15%) and networking (15%).

### Data center architectures
- **Hosts** (called **blades**, looking like pizza boxes) are generally commodity hosts with CPU, memory and disk storage, stacked in **racks** (each holding 20–40 blades).
- At the top of each rack is a switch, called the **Top of Rack (TOR) switch**, which connects the hosts in the rack with each other and with other switches in the data center. Each host has its own data-center-internal IP address. Host-to-TOR links are typically 40 or 100 Gbps Ethernet.
- **Border routers** connect the data center network to the public Internet. The data center network must handle traffic between external clients and internal hosts, as well as traffic between internal hosts.
- **Load balancing:** a data center provides many applications simultaneously; each application has a publicly visible IP address that external users send requests to. Inside the data center, the requests are first sent to a **load balancer**, which distributes them across the hosts handling the application, balancing the load based on the hosts' current load. Load balancers are often called **"layer-4 switches"** since they make decisions based on the destination port number (layer 4) as well as the destination IP address. The load balancer also acts like NAT, translating the public external IP address to the internal IP address of the appropriate host, which provides security by hiding the internal network structure.
- **Hierarchical architecture:** for data centers with tens to hundreds of thousands of hosts, a **hierarchy of routers and switches** is used: a border router at the top, connected to **access routers**, connected to a hierarchy of tier-1, tier-2 and TOR switches. Redundancy is built in.
  - Problem: **limited host-to-host capacity**. Because of over-subscription (the upper tiers have much less capacity than the sum of the hosts below), when many hosts in different racks need to communicate at once, the links between tiers become bottlenecks.
- **Fully connected topology (Clos networks):** to fix this, each tier-1 switch connects to **all** of the tier-2 switches. This gives much greater host-to-host capacity, and many **disjoint paths** between racks: traffic between racks can be spread across many paths, which also improves reliability.

### Trends in data center networking
- **Centralized SDN control and management:** because a data center is managed by a single organization, it's natural to use a logically centralized controller, as in SDN (Chapter 5). Google, for example, uses SDN in its data centers.
- **Virtualization:** virtual machines (VMs) decouple software from physical servers, making it easy to move VMs between physical servers, which may be in different racks. Standard Ethernet and IP protocols have limitations in supporting VM migration while keeping active network connections.
- **Physical constraints:** data center networks operate in a unique environment, with very high capacity (40, 100, 400 Gbps links) and extremely low delays (microseconds). Congestion control protocols like **DCTCP (Data Center TCP)** are specially designed for these networks.
- **Hardware modularity and customization:** **shipping container-based modular data centers (MDCs)**: a factory builds a "mini data center" inside a standard 12-meter shipping container and ships it to the data center location, where many containers are connected. Containers are designed for graceful performance degradation: as components fail over time, the container isn't repaired, just replaced when performance drops below a threshold. Companies also build their own custom networking hardware.

## 6.7 Retrospective: A Day in the Life of a Web Page Request

This section ties everything in the book together by following a student, Bob, who connects his laptop to his school's Ethernet switch and downloads a web page (`www.google.com`). It shows the protocols in action from start to finish.

### Getting started: DHCP, UDP, IP and Ethernet
1. Bob's laptop needs an IP address, so it runs **DHCP**. The OS creates a **DHCP request message** and puts it in a **UDP segment** (destination port 67, source port 68), which goes in an **IP datagram** with a **broadcast destination IP address (255.255.255.255)** and source IP address **0.0.0.0**, since the laptop doesn't have an address yet.
2. The IP datagram goes into an **Ethernet frame** with destination MAC address **FF:FF:FF:FF:FF:FF** (broadcast to all devices on the switch), and the laptop's MAC address as the source.
3. The **switch** broadcasts the frame on all its outgoing ports, including the port connected to the school's router.
4. The **router** receives the frame and extracts the IP datagram. The datagram's broadcast destination address says it should be processed by upper-layer protocols at this node, so the payload (a UDP segment) goes up to UDP and the DHCP request message is extracted. The **DHCP server** (running in the router here) now has the request.
5. The DHCP server allocates an IP address (in its CIDR block, for example, 68.85.2.0/24) to Bob's laptop, then creates a **DHCP ACK message** containing that IP address, the IP address of the **DNS server**, the IP address of the **default gateway router** and the **subnet block** (network mask). It puts it in a UDP segment, in an IP datagram, in an Ethernet frame with Bob's laptop's MAC address as the destination.
6. The frame is sent (unicast) by the router to the switch. Because the switch is **self-learning**, and it previously received a frame (with the DHCP request) from Bob's laptop, it knows to forward a frame addressed to Bob's MAC address only to the output port leading to Bob's laptop.
7. Bob's laptop receives the frame, extracts the DHCP ACK and records its own IP address, the DNS server's IP address and the default gateway's IP address. It is now ready to begin processing the web page fetch.

### Still getting started: DNS and ARP
8. When Bob types `www.google.com` into his browser, the browser starts by creating a TCP socket to send the HTTP request. But first it needs the IP address of `www.google.com`, so the OS creates a **DNS query message**, puts it in a UDP segment (destination port 53) in an IP datagram with the DNS server's IP address as the destination.
9. Bob's laptop puts that datagram in an Ethernet frame, to be sent (at the link layer) to the gateway router. But it doesn't know the **gateway router's MAC address** yet (it only knows its IP address from DHCP). So it uses **ARP**.
10. The laptop creates an **ARP query** message with the target IP address of the default gateway, puts it in an Ethernet frame with the broadcast destination address, and sends it to the switch, which delivers it to all connected devices, including the gateway router.
11. The gateway router receives the frame, finds that the target IP address matches its own interface's IP address, and prepares an **ARP reply**, saying its MAC address corresponds to that IP address. It sends the reply in an Ethernet frame with Bob's laptop as the destination.
12. Bob's laptop receives the frame with the ARP reply and extracts the **MAC address of the gateway router**.
13. Now Bob's laptop can finally address the Ethernet frame containing the DNS query to the **gateway router's MAC address**. The IP datagram inside still has the **DNS server's IP address** as its destination. The laptop sends the frame to the switch, which delivers it to the gateway router.

### Still getting started: intra-domain routing to the DNS server
14. The gateway router receives the frame and extracts the IP datagram containing the DNS query. It looks up the destination address (the DNS server) and decides from its forwarding table which router in the school's provider network (say, Comcast) to send it to. It puts the datagram in a link-layer frame appropriate for the link to that router and sends it.
15. The router in the provider network receives the frame, extracts the datagram, examines its destination address and decides which output interface to forward it on, based on its forwarding table. The forwarding table was filled in by the provider's **intra-domain routing protocol** (like **OSPF**, IS-IS or RIP) as well as the Internet's **inter-domain protocol, BGP**.
16. Eventually the datagram with the DNS query arrives at the DNS server. The DNS server extracts the query, looks up the name `www.google.com` in its DNS database and finds the **DNS resource record** with the IP address for `www.google.com` (assuming it's cached; otherwise, the query would go to the authoritative DNS server for google.com). The DNS server forms a **DNS reply message** with this hostname-to-IP mapping, puts it in a UDP segment and IP datagram addressed to Bob's laptop, and sends it back through the provider network and the school's router to the switch to Bob's laptop.
17. Bob's laptop extracts the IP address of `www.google.com` from the DNS message. **Finally**, after a lot of work, the laptop is ready to contact the Google server.

### Web client-server interaction: TCP and HTTP
18. Now that Bob's laptop has the IP address of `www.google.com`, it can create the **TCP socket** that will be used to send the **HTTP GET** message. When it creates the socket, TCP in the laptop must first perform a **three-way handshake** with TCP in the Google server. So the laptop first creates a **TCP SYN segment** with destination port 80 (for HTTP), puts it in an IP datagram with Google's IP address as the destination, puts that in a frame with the gateway router's MAC address as the destination and sends it to the switch.
19. Routers in the school network, the provider network and Google's network forward the datagram containing the TCP SYN toward `www.google.com`, using the forwarding table in each router, as in steps 14–16. Recall that the forwarding table entries governing the packet's movement across the inter-domain link between the provider and Google's networks are determined by **BGP**.
20. Eventually the datagram with the TCP SYN arrives at `www.google.com`. The TCP SYN message is extracted and demultiplexed to the **welcome socket** associated with port 80. A **connection socket** is created for the TCP connection between the Google HTTP server and Bob's laptop. A **TCP SYNACK** segment is generated, put in a datagram addressed to Bob's laptop, and finally placed in a link-layer frame appropriate for the link connecting `www.google.com` to its first-hop router.
21. The datagram containing the TCP SYNACK segment is forwarded through the Google, provider and school networks, eventually arriving at the Ethernet controller in Bob's laptop. The datagram is demultiplexed within the OS to the TCP socket created in step 18, which enters the **connected state**.
22. With the socket on Bob's laptop now (finally!) ready to send bytes to `www.google.com`, Bob's browser creates the **HTTP GET message** containing the URL to be fetched. The HTTP GET message is then written into the socket, becoming the payload of a TCP segment. The TCP segment is put in a datagram and sent and delivered to `www.google.com` as in steps 18–20.
23. The HTTP server at `www.google.com` reads the HTTP GET message from the TCP socket, creates an **HTTP response message**, places the requested web page content in the body of the HTTP response message, and sends the message into the TCP socket.
24. The datagram containing the HTTP reply is forwarded through the Google, provider and school networks and arrives at Bob's laptop. Bob's web browser reads the HTTP response from the socket, extracts the HTML for the web page from its body and **finally (!) displays the web page**.

The takeaway: even a simple web page request involves DHCP, UDP, IP, Ethernet, ARP, DNS, intra- and inter-domain routing (OSPF, BGP), TCP and HTTP, all working together across many layers and networks.

## Key terms
- **Node, link, frame:** the basic link-layer vocabulary.
- **NIC / network adapter:** hardware that implements most of the link layer.
- **Parity check / two-dimensional parity:** simple error detection; 2-D parity can correct single-bit errors.
- **FEC:** forward error correction.
- **CRC:** cyclic redundancy check; R = remainder(D·2^r / G) using XOR arithmetic.
- **Point-to-point vs. broadcast link.**
- **Collision:** two or more simultaneous transmissions on a broadcast channel.
- **Channel partitioning (TDM, FDM, CDMA), random access (ALOHA, CSMA, CSMA/CD), taking-turns (polling, token passing):** the three classes of MAC protocols.
- **Slotted ALOHA efficiency:** 1/e ≈ 37%; **pure ALOHA:** 1/(2e) ≈ 18%.
- **Binary exponential backoff:** after n collisions, choose K from {0, …, 2^n − 1}.
- **DOCSIS:** cable link-layer protocol combining FDM, TDM and random access.
- **MAC address:** 48-bit, flat, permanent link-layer address; broadcast FF-FF-FF-FF-FF-FF.
- **ARP:** maps IP addresses to MAC addresses within a subnet.
- **Ethernet frame:** preamble, destination and source MAC, type, data (46–1,500 bytes), CRC.
- **Hub vs. switch:** layer-1 repeater vs. layer-2 store-and-forward device.
- **Switch table, filtering, forwarding, self-learning.**
- **Switch poisoning, broadcast storm.**
- **VLAN, trunk port, 802.1Q tag.**
- **MPLS:** forwarding based on fixed-length labels; traffic engineering, fast restoration, VPNs.
- **TOR switch, load balancer, Clos network:** data center networking building blocks.

## Quick review
- Compute a CRC remainder with modulo-2 division.
- Compare the three classes of MAC protocols and their efficiencies.
- Explain how CSMA/CD and binary exponential backoff work.
- Walk through ARP, including sending a datagram to a host on another subnet.
- Describe how a switch fills in its table and decides to flood, filter or forward.
- Compare switches and routers, and explain why VLANs are useful.
- Trace every protocol step in the "day in the life of a web page request."
