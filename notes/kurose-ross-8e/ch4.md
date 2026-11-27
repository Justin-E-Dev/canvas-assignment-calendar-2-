# Chapter 4: The Network Layer: Data Plane

The network layer moves datagrams from one host to another across many networks, and unlike the layers above it, it runs in **every host and every router**. The book splits it into two chapters. This one covers the **data plane**: what happens inside a single router to move an arriving packet to the right output (forwarding). Chapter 5 covers the **control plane**: how routes across the whole network are computed. Topics here: router internals, IPv4 and its addressing, DHCP, NAT, IPv6, generalized forwarding with SDN, and middleboxes.

## 4.1 Overview of Network Layer

- The sending host takes transport-layer segments, wraps each one in a **datagram**, and sends it to its nearby router. Routers along the path forward the datagram, and the receiving host extracts the segment and delivers it up to the transport layer.
- **Routers don't run the application or transport layers**: they look only at network-layer (and lower) headers.

### Forwarding and routing
- **Forwarding (data plane):** a **router-local** action. When a packet arrives on an input link, the router moves it to the appropriate output link. Happens in hardware, very fast: **nanoseconds**.
- **Routing (control plane):** a **network-wide** process that determines the end-to-end paths packets take from source to destination. Uses **routing algorithms**. Happens in software, on a timescale of **seconds**.
- Analogy: a road trip. **Forwarding** is going through a single highway interchange; **routing** is planning the whole trip from Pennsylvania to Florida.
- Every router has a **forwarding table**. It looks at a field in the arriving packet's header (like the destination address) and uses it to index into the table, which tells it which outgoing link to use.

### Two control-plane approaches
- **Traditional (per-router) control plane:** a routing algorithm runs in **every router**; routers exchange routing messages with each other, and each computes its own forwarding table.
- **SDN (Software-Defined Networking) control plane:** a separate, physically remote **controller** computes forwarding tables and installs them in the routers. Routers just forward. The network is "software-defined" because the controller that computes the tables is implemented in software.

### Network service model
What could the network layer promise? Possible services include guaranteed delivery, guaranteed delivery with bounded delay, in-order packet delivery, guaranteed minimum bandwidth and security. The Internet's network layer provides only one service: **best-effort service**. Packets aren't guaranteed to arrive, to arrive in order, or to arrive within any time bound, and no bandwidth is guaranteed. Best effort is minimal, but combined with adequate bandwidth provisioning and adaptive apps (like DASH), it has worked very well.

### A note on terminology
The book uses **"packet switch"** for a general device that forwards packets based on header fields. **Link-layer switches** forward based on link-layer (MAC) addresses; **routers** forward based on network-layer (IP) addresses.

## 4.2 What's Inside a Router?

A router has four main components:
- **Input ports:**
  - perform the physical-layer function of terminating the incoming link;
  - perform link-layer functions to interoperate with the other side;
  - perform the crucial **lookup** function: consult the forwarding table to find the output port. (Control packets carrying routing information are sent to the routing processor.)
- **Switching fabric:** connects the input ports to the output ports. It's a network inside the router.
- **Output ports:** store packets received from the fabric and transmit them on the outgoing link, doing the needed link-layer and physical-layer functions.
- **Routing processor:** does **control-plane** functions. In traditional routers it runs routing protocols, maintains routing tables and computes the forwarding table. In SDN routers it talks to the remote controller to receive forwarding table entries. It also does network management.

The input ports, fabric and output ports are usually implemented in **hardware**, because they must work on **nanosecond** timescales (at 100 Gbps, a 64-byte packet arrives every 5.12 ns). The control plane works in **software** on milliseconds-to-seconds timescales.

### Destination-based forwarding
- Forwarding based only on the destination IP address.
- Listing every possible address would make forwarding tables enormous (4 billion IPv4 addresses), so tables match **address prefixes** instead.
- **Longest prefix matching:** when an address matches several table entries, the router uses the entry with the **longest matching prefix**. Example table: prefix `11001000 00010111 00011000` → link 1, and prefix `11001000 00010111 00011` → link 2. The address `11001000 00010111 00011000 10101010` matches **both** prefixes, but the first one is longer (24 bits vs. 21), so the router sends it out **link 1**. The address `11001000 00010111 00011110 10101010` matches only the second, so it goes out link 2.
- Lookup must happen in nanoseconds, so it's done in hardware, often with **TCAMs (Ternary Content Addressable Memories)**, which can look up an address in a single clock cycle no matter how large the table is.

### Other input-port processing
- Physical- and link-layer processing.
- Checking the packet's version number, checksum and time-to-live field, and rewriting the latter two.
- Updating counters used for network management (like the number of IP datagrams received).
- The **"match plus action"** idea: look up the destination (match), then send the packet to the right output port (action). This general pattern appears throughout networking (firewalls, NAT, SDN).

### Switching fabrics (three types)
- **Switching via memory:** the earliest routers were ordinary computers. An arriving packet is copied into the processor's memory, the processor looks up the output port, and copies it to the output port's buffers. Limit: if the memory bandwidth allows B packets per second to be written or read, overall forwarding throughput is less than **B/2**, and only one packet can be forwarded at a time because they share one system bus.
- **Switching via a bus:** an input port sends a packet directly to the output port over a **shared bus**, without the routing processor. The input port adds a label saying which output port should take it. Only **one packet can cross the bus at a time**, so switching speed is limited by the bus speed. Fine for small local and enterprise networks.
- **Switching via an interconnection network:** for example, a **crossbar switch**, a grid of 2N buses connecting N inputs to N outputs. Each crossing point can be opened or closed by the fabric controller. It can forward **multiple packets in parallel**, as long as they go to **different output ports** (it's **non-blocking** in that sense). Packets headed to the same output must wait. Bigger, multi-stage fabrics are built from smaller switches.

### Output-port processing
Takes packets from the output port's memory and transmits them on the output link, including selecting and dequeuing packets for transmission and doing link-layer and physical-layer functions.

### Where does queuing occur?
Queues (and therefore delay and loss) can form at **both input and output ports**, depending on traffic load, the fabric's speed and the line speed.
- **Input queuing:** if the switching fabric isn't fast enough to move all arriving packets through without delay, packets queue at the inputs.
  - **Head-of-the-line (HOL) blocking:** a packet at the front of an input queue waiting for a busy output port **blocks the packets behind it**, even if *their* output ports are free. Because of HOL blocking, input queues can grow without limit once the arrival rate reaches only about **58% of capacity** (under certain assumptions).
- **Output queuing:** even with a very fast fabric, if packets from N inputs all head to the same output at once, they queue at that output. When the output buffer is full, packets must be dropped (**drop-tail**) or other packets removed to make room.
  - **Active queue management (AQM)** algorithms drop or mark packets *before* the buffer is full, to signal congestion early. A widely studied one is **RED (Random Early Detection)**, which drops or marks packets with a probability that rises with the average queue length.

### How much buffering?
- The old **rule of thumb**: buffer = **RTT × C** (average round-trip time times link capacity). Example: a 10 Gbps link with a 250 ms RTT would need 2.5 Gbits of buffer.
- For a large number of TCP flows (N), research suggests **RTT × C / √N** is enough.
- More buffering isn't always better. Big buffers can cause **bufferbloat**: persistently full queues that add long delays without improving throughput. That's bad for interactive apps like games and video calls, especially with home routers.

### Packet scheduling
How does a router choose which queued packet to send next?
- **FIFO (first-in-first-out / first-come-first-served):** packets are sent in the order they arrived.
- **Priority queuing:** arriving packets are classified into priority classes (for example, network management or real-time voice above email). The router always sends from the **highest-priority non-empty queue**; within a class, FIFO. **Non-preemptive**: a packet already being sent isn't interrupted.
- **Round robin and Weighted Fair Queuing (WFQ):**
  - **Round robin:** the scheduler **alternates** among classes, sending one packet from class 1, then class 2, etc. A **work-conserving** scheduler never lets the link sit idle while packets are waiting.
  - **WFQ:** a generalized round robin where each class i gets a **weight w_i**, and is guaranteed a share of the link bandwidth of **w_i / Σw_j** (when all classes have packets waiting). So class i gets at least **R · w_i/Σw_j** of a link with rate R.

### Net neutrality
**Net neutrality** is the policy question of whether ISPs should be allowed to prioritize, slow down or block certain traffic. In the US, rules have changed over time. The 2015 FCC rules banned **blocking**, **throttling** and **paid prioritization** (charging content companies for faster delivery). Those rules were repealed in 2017, and the debate continues. It's related to scheduling, because priority queuing and WFQ are exactly the tools that could be used to treat traffic differently.

## 4.3 The Internet Protocol (IP): IPv4, Addressing, IPv6, and More

### IPv4 datagram format
Important fields:
- **Version number** (4 bits): IPv4 or IPv6, so the router knows how to read the rest.
- **Header length** (4 bits): needed because IPv4 options make the header variable length. Most datagrams have no options, giving a **20-byte header**.
- **Type of service (TOS)**: distinguishes kinds of datagrams (e.g., real-time vs. not). Two of its bits are used for **ECN** (Explicit Congestion Notification).
- **Datagram length** (16 bits): total length (header plus data) in bytes. Theoretical maximum 65,535 bytes; usually 1500 bytes or less.
- **Identifier, flags, fragmentation offset:** used for **IP fragmentation** (see below). IPv6 doesn't allow fragmentation at routers.
- **Time-to-live (TTL)** (8 bits): makes sure datagrams don't circulate forever (for example, in a routing loop). It's decremented by one at each router; if it reaches 0, the router **drops** the datagram.
- **Protocol** (8 bits): used only at the destination; tells which transport protocol gets the data: **6 = TCP**, **17 = UDP**. It's the glue between the network and transport layers, like the port number is for transport and application.
- **Header checksum:** helps routers detect bit errors in the header only. It must be **recalculated at every router**, because the TTL changes. Routers typically discard datagrams with errors.
- **Source and destination IP addresses** (32 bits each).
- **Options:** rarely used; they make processing slower, so they were removed from the IPv6 header.
- **Data (payload):** usually a TCP or UDP segment, but can also be other data like ICMP messages.
- Overhead: a datagram carrying a TCP segment has **40 bytes of headers** (20 IP + 20 TCP) plus the application message.

### IP fragmentation
- Different link layers have different **MTUs (Maximum Transmission Units)**, the largest frame payload they can carry. A large datagram may need to cross a link with a smaller MTU.
- Fragmentation splits the datagram into smaller **fragments**, each its own IP datagram. They are **reassembled only at the destination host**, not at routers.
- The **identifier** is the same for all fragments of one datagram; the **flag** bit is 1 for every fragment except the last (0 means "this is the last fragment"); the **offset** field says where the fragment's data fits in the original datagram, in **units of 8 bytes**.
- Example: a 4,000-byte datagram (20-byte header + 3,980 bytes of data) crossing a link with a 1,500-byte MTU becomes **three fragments** carrying 1,480, 1,480 and 1,020 bytes of data, with offsets **0, 185 and 370** (1,480/8 = 185).
- If any fragment is lost, the whole datagram can't be reassembled.

### IPv4 addressing
- An **interface** is the boundary between a host or router and a physical link. A host typically has one interface; a router has several (one per link). **IP addresses belong to interfaces, not to hosts or routers.**
- An IPv4 address is **32 bits** long (about 4 billion possible addresses), written in **dotted-decimal notation**: each byte written in decimal, separated by dots (e.g., `193.32.216.9`; `193` is `11000001` in binary).
- **Subnets:** a group of interfaces that can physically reach each other without going through a router (for example, hosts connected by an Ethernet switch or WiFi access point) is a **subnet**. They share the same leftmost bits of their address. For example, `223.1.1.0/24` means the leftmost **24 bits** define the subnet; `/24` is the **subnet mask**. To find the subnets, detach each interface from its host or router, creating islands of isolated networks; each island is a subnet.
- **CIDR (Classless Interdomain Routing):** the Internet's address-assignment strategy. An address has the form **a.b.c.d/x**, where the first **x bits** are the **prefix** (the network part) and the remaining bits identify hosts inside the organization.
  - Routers outside the organization only need the prefix to forward packets toward it, which keeps forwarding tables much smaller.
  - **Address aggregation (route aggregation / summarization):** one prefix can advertise many networks. If an ISP owns `200.23.16.0/20` and gives its 8 customer organizations `/23` blocks inside it, the ISP only needs to tell the rest of the Internet "send me anything matching 200.23.16.0/20." If an organization switches ISPs, the new ISP can advertise the more specific prefix, and **longest prefix matching** makes routers send its traffic the right way.
- **Classful addressing (old, replaced by CIDR):** fixed network parts of 8, 16 or 24 bits (class A, B, C). Class C (/24) allowed only 254 hosts, too small for many organizations, while class B (/16) allowed 65,534, too big, which wasted addresses.
- **Broadcast address** `255.255.255.255`: a datagram sent there is delivered to all hosts on the same subnet (routers usually don't forward it further).

### Obtaining addresses
- An organization gets a block of addresses from its **ISP**, which carves them out of its own larger block.
- Address space is ultimately managed by **ICANN** (Internet Corporation for Assigned Names and Numbers), which allocates blocks to **regional Internet registries** (like ARIN in North America) and also manages DNS root servers and domain names.

### DHCP (Dynamic Host Configuration Protocol)
- Router addresses are usually configured manually, but **host** addresses are usually assigned automatically by **DHCP**.
- DHCP gives a host its **IP address**, **subnet mask**, the address of its **first-hop router (default gateway)** and the address of its **local DNS server**.
- It can give the same address each time or a **temporary address** that changes. Great for mobile users and **plug-and-play / zeroconf** networking.
- **Client-server protocol:** each subnet has a DHCP server, or a router acting as a **DHCP relay agent** that knows the server's address.
- **Four-step process (DORA):**
  1. **DHCP discover:** the newly arrived client doesn't know the server's address or even its own, so it broadcasts a UDP message to port 67, from source address `0.0.0.0` to destination `255.255.255.255`.
  2. **DHCP offer:** the server replies (also broadcast) with a proposed IP address, the network mask and an **address lease time** (how long the address is valid; often hours or days).
  3. **DHCP request:** the client picks one offer (there may be several servers) and replies with a request echoing the parameters.
  4. **DHCP ACK:** the server confirms.
- A client can **renew** its lease before it expires.
- Downside: when a mobile device moves to a new subnet, it gets a new address, so a TCP connection to a remote app can't be maintained across the move (this is covered by mobility management in Chapter 7).

### NAT (Network Address Translation)
- Problem: every IP device needs an address, and IPv4 addresses are scarce. A home network with many devices would need a block of addresses from its ISP.
- **NAT** lets a whole home or business network share **one public IP address**.
- Devices inside the home network use addresses from a **private address range**, like **10.0.0.0/8**, 172.16.0.0/12 or **192.168.0.0/16**. These are reused in millions of home networks and are only meaningful inside the local network.
- The **NAT-enabled router** looks like a single device with one IP address to the outside world.
- **NAT translation table:** for outgoing datagrams, the router replaces the source **(private IP address, port)** with **(the router's public IP address, a new port number)** and records the mapping. For incoming datagrams, it looks up the destination port and swaps back to the right private address and port.
  - Example: host 10.0.0.1 sends from port 3345 to a web server on port 80. The NAT router rewrites the source to 138.76.29.7 port 5001 and records `138.76.29.7:5001 ↔ 10.0.0.1:3345`. The web server's reply to 138.76.29.7:5001 is translated back to 10.0.0.1:3345.
  - The 16-bit port field allows over 60,000 simultaneous connections through one public address.
- **Criticisms of NAT:**
  - Port numbers are supposed to address **processes**, not hosts.
  - Routers are supposed to process packets only up to layer 3, but NAT rewrites transport-layer ports.
  - It breaks the **end-to-end argument**: hosts should talk directly, without nodes in the middle modifying addresses and ports.
  - Servers behind NAT can't easily accept incoming connections. That's a problem for P2P apps, which need **NAT traversal** techniques (like connection relaying).
  - People argue IPv6 should be used instead to solve the address shortage. Even so, NAT is everywhere.

### IPv6
- Motivation: the 32-bit IPv4 address space was running out (IANA allocated the last unassigned IPv4 blocks to the regional registries in 2011). IPv6 was developed by the IETF in the 1990s.
- **Main changes:**
  - **Expanded addresses:** from 32 bits to **128 bits**, so the world will essentially never run out. Besides unicast and multicast, IPv6 has **anycast** addresses (a datagram is delivered to any one of a group of hosts, such as the nearest mirror server).
  - **A streamlined 40-byte header:** fixed length, which lets routers process datagrams faster.
  - **Flow labeling:** packets belonging to a particular **flow** (like real-time audio/video) can be labeled so the sender can request special handling.
- **IPv6 datagram format:**
  - **Version** (6).
  - **Traffic class** (8 bits): like IPv4's TOS; used to prioritize datagrams.
  - **Flow label** (20 bits): identifies a flow of datagrams.
  - **Payload length** (16 bits): the number of bytes after the 40-byte header.
  - **Next header:** which protocol the data goes to (like TCP or UDP), the same values as IPv4's protocol field.
  - **Hop limit:** decremented by each router; the datagram is discarded at 0 (like IPv4's TTL).
  - **Source and destination addresses** (128 bits each).
  - **Data.**
- **Removed from IPv4:**
  - **Fragmentation/reassembly:** IPv6 doesn't allow fragmentation at routers. If a datagram is too big for a link, the router **drops** it and sends back an ICMP "Packet Too Big" error, and the sender resends smaller datagrams. (Fragmentation can only be done by the source and destination.) This speeds up forwarding.
  - **Header checksum:** removed because transport and link layers already check for errors, and recomputing it at every router was slow.
  - **Options:** no longer part of the standard header; they're handled as possible "next headers" instead, which keeps the header fixed at 40 bytes.

### Transitioning from IPv4 to IPv6
- You can't switch the whole Internet at once (there's no "flag day"). New IPv6 systems can be backward-compatible, but deployed IPv4-only systems can't handle IPv6.
- **Tunneling:** the main approach. When two IPv6 nodes are connected through IPv4 routers, the IPv6 node at the entrance of the **tunnel** puts the **entire IPv6 datagram inside the data field of an IPv4 datagram** (with protocol number 41), addressed to the IPv6 node at the tunnel's exit. IPv4 routers forward it like any IPv4 datagram, unaware it carries IPv6. The exit node extracts the IPv6 datagram and continues forwarding it.
- IPv6 adoption has been slow but is growing. Big content providers and cellular networks use IPv6 heavily, and a large and growing share of Google traffic arrives over IPv6. A lesson: it's very hard to change network-layer protocols, while application-layer protocols (like new apps) can spread quickly.

## 4.4 Generalized Forwarding and SDN

- Destination-based forwarding is a special case of **"match plus action"** forwarding: match the destination address, and the action is to send the packet to an output port.
- **Generalized forwarding:** a **match-plus-action table** can match on **many header fields**, from different layers (link, network, transport), and take various actions:
  - **forward** the packet to one or more output ports,
  - **drop** the packet (as in a firewall),
  - **modify** header fields (as in NAT, rewriting addresses and ports), etc.
- The devices are called **packet switches** (not routers or link-layer switches), because they can do both layer-2 and layer-3 forwarding and more.
- These **flow tables** are computed and installed by a remote **SDN controller**.

### OpenFlow
**OpenFlow** is a well-known standard for match-plus-action forwarding and the controller-to-switch protocol. Each flow table entry has:
- **Header field values to match:** incoming packets are compared against these. Packets that don't match any entry can be dropped or sent to the controller.
- **Counters:** for example, the number of packets matched and the time since the entry was last updated.
- **Actions:** what to do with a matching packet.

**What can be matched (11 or so fields across layers):**
- **Link layer:** ingress port, source MAC, destination MAC, Ethernet type, VLAN ID, VLAN priority.
- **Network layer:** source IP, destination IP, IP protocol, IP type of service.
- **Transport layer:** source port, destination port.
- Fields can be **wildcards** (e.g., match any destination in `128.119.*.*`). Entries have **priorities** when several match.
- Not every IP field can be matched: for example, TTL and datagram length can't. The design balances functionality against simplicity.

**Actions:**
- **Forwarding:** to one specific port, broadcast to all ports (except the incoming one), or multicast to a selected set. Packets can also be sent to the **controller**, which may take its own action or install a new flow table rule.
- **Dropping:** a flow table entry with no action means matching packets are dropped.
- **Modify-field:** rewrite up to 10 header fields (all except the IP protocol field) before forwarding.

**Examples of what match-plus-action can do:**
- **Simple forwarding:** packets from hosts h5/h6 to h3/h4 are forwarded along a specific path set by entries in each switch.
- **Load balancing:** packets from different sources heading to the same destination are sent along different paths.
- **Firewalling:** a switch only accepts traffic from certain subnets and **drops** everything else.
- In the same framework, a device can behave like a **router** (match on destination IP), a **switch** (match on destination MAC), a **firewall** (match on IP addresses and ports, drop), or a **NAT box** (match on IP and port, rewrite them).

## 4.5 Middleboxes

- The book defines a **middlebox** as any intermediary box doing functions other than the normal functions of an IP router on the data path between a source and a destination.
- **Three types of services:**
  - **NAT translation:** rewrites header IP addresses and port numbers (Section 4.3).
  - **Security services:**
    - **Firewalls** block traffic based on header field values or redirect packets for more processing;
    - **Intrusion Detection Systems (IDS)** look for predetermined patterns and can filter packets;
    - **application-level email filters** remove junk mail, phishing or malware.
  - **Performance enhancement:**
    - **compression**;
    - **content caching** (web caches, CDN servers);
    - **load balancers**, which direct requests for a service (like an HTTP request) to one of a set of servers that can provide it.
- Many middleboxes now run as software on commodity hardware, a trend called **Network Function Virtualization (NFV)**: replacing expensive specialized hardware with software running on standard servers, switches and storage.

### The architectural principles of the Internet
- The **IP hourglass**: the Internet has many application-, transport- and link-layer protocols, but at the network layer there's essentially **one protocol, IP**, the "narrow waist" of the hourglass that everything must speak. This made it possible for so many different networks and apps to work together.
- Middleboxes "break the hourglass" by working across layers, which is part of why some people criticize them.
- **The end-to-end argument:** a function should be implemented at the endpoints of communication if it can only be done fully and correctly there, with the application's knowledge. Implementing it in the network (lower layers) may be redundant or only a performance optimization. (Example: reliable data transfer is done end-to-end by TCP, even if links also do error checking.)
- **Where's the intelligence?** In the traditional telephone network, intelligence was in the **network core** (switches) and end devices were "dumb" phones. The Internet put the intelligence at the **edge** (hosts), with a simple best-effort core. This made it very easy to deploy new applications without changing the network. With SDN and middleboxes, more functionality is moving back into the network.

## Key terms
- **Forwarding vs. routing:** router-local data movement vs. network-wide path computation.
- **Data plane / control plane:** the forwarding part / the routing part.
- **SDN:** a remote controller computes and installs forwarding tables.
- **Best-effort service:** no guarantees about delivery, order, timing or bandwidth.
- **Input port, switching fabric, output port, routing processor:** the four parts of a router.
- **Longest prefix matching:** use the most specific matching entry.
- **TCAM:** hardware memory for very fast lookups.
- **HOL blocking:** a packet at the front of an input queue blocks those behind it.
- **AQM / RED:** dropping or marking packets early to signal congestion.
- **Bufferbloat:** too much buffering causing long delays.
- **FIFO, priority, round robin, WFQ:** packet scheduling disciplines.
- **TTL:** a counter decremented at each router, so packets don't loop forever.
- **Fragmentation:** splitting a datagram to fit a smaller MTU; reassembled at the destination.
- **Interface:** the connection between a host or router and a link; IP addresses belong to interfaces.
- **Subnet and subnet mask (/x):** a group of interfaces sharing an address prefix.
- **CIDR:** classless addressing with a.b.c.d/x prefixes; enables route aggregation.
- **DHCP:** automatically assigns IP addresses and settings (discover, offer, request, ACK).
- **NAT:** many private addresses share one public address, using port mappings.
- **IPv6:** 128-bit addresses, a fixed 40-byte header, flow labels, no fragmentation at routers, no checksum.
- **Tunneling:** carrying IPv6 datagrams inside IPv4 datagrams.
- **Generalized forwarding / OpenFlow:** match on many header fields; forward, drop or modify.
- **Middlebox:** NAT, firewall, IDS, load balancer, cache, etc.
- **NFV:** network functions as software on commodity hardware.
- **End-to-end argument:** put functions at the endpoints when only they can do them correctly.

## Quick review
- Explain the difference between forwarding (data plane) and routing (control plane).
- Apply longest prefix matching to a forwarding table.
- Work out fragmentation: number of fragments, data sizes and offsets.
- Given a.b.c.d/x, find the network prefix, the number of addresses and subnet boundaries.
- Walk through DHCP's four steps and a NAT translation.
- List what IPv6 changed and removed compared with IPv4, and how tunneling works.
- Describe how OpenFlow match-plus-action can act as a router, switch, firewall or NAT.
