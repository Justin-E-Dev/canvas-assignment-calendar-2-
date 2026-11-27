# Chapter 1: Computer Networks and the Internet

This chapter is the big-picture tour. It explains what the Internet is made of (devices, links, routers, ISPs), how data actually moves across it (packet switching), what slows data down (delay, loss, throughput), how networking is organized into layers, how networks get attacked, and a short history. Almost every idea here comes back in more depth later in the book, so it's worth knowing the vocabulary well.

## 1.1 What Is the Internet?

The book describes the Internet in two complementary ways.

### The "nuts and bolts" view (what it's built from)
- **End systems (hosts):** the devices at the edge that run applications: laptops, phones, servers, smart TVs, game consoles, sensors, cars. They're called *hosts* because they host (run) application programs.
- **Communication links:** the physical connections that carry bits: copper wire, coaxial cable, fiber optic cable, and radio (WiFi, cellular, satellite). Each link has a **transmission rate** measured in bits per second (bps).
- **Packet switches:** devices that forward data toward its destination. The two main kinds are **routers** (used in the network core) and **link-layer switches** (used in local networks).
- **Packets:** a host breaks data into chunks and adds header information to each one; these chunks are called packets. Packets travel through a sequence of links and packet switches called a **route** or **path**.
- **ISPs (Internet Service Providers):** end systems get access to the Internet through ISPs: residential ISPs (cable/DSL companies), university and company networks, cellular providers. ISPs are themselves connected to each other in a hierarchy, which is why the Internet is called a "network of networks."
- **Protocols:** every piece of the Internet runs protocols that control sending and receiving. The two most important are **TCP** (Transmission Control Protocol) and **IP** (Internet Protocol); together the Internet's main protocols are called **TCP/IP**.
- **Standards:** Internet standards are developed by the **IETF** (Internet Engineering Task Force) and published as **RFCs** (Requests for Comments). Other bodies, like the **IEEE 802** committee, set standards for Ethernet and WiFi.

### The "services" view (what it does for applications)
- The Internet is an infrastructure that provides services to **distributed applications**: apps that run on many end systems that exchange data (web, email, streaming, games, social media).
- Applications run on the end systems, not inside the routers in the middle.
- End systems use a **socket interface** to ask the Internet to deliver data to a program on another end system, a bit like using the postal service by following its rules for addressing envelopes.

### What is a protocol?
A **protocol** defines the format and order of messages exchanged between two or more communicating entities, and the actions taken when a message is sent or received (or when something else happens, like a timeout). Human analogy: when you ask someone the time, you say "Hi", wait for "Hi" back, then ask. If they don't respond the expected way, you change what you do. Network protocols are the same idea, but between machines.

## 1.2 The Network Edge

The **network edge** is where end systems live. Hosts are often split into **clients** (like your laptop) and **servers** (powerful machines, often in large **data centers**).

### Access networks
An **access network** is the network that physically connects an end system to the first router on its path (the **edge router**). Common types:

- **DSL (Digital Subscriber Line):** uses the existing telephone line. A DSL modem at home talks to a **DSLAM** (DSL access multiplexer) at the phone company's central office. Data and phone calls share the line using different frequencies. It's **asymmetric**: download is faster than upload. Speed drops with distance from the central office.
- **Cable internet:** uses the cable TV company's coaxial network. Fiber runs from the cable head end to neighborhood junctions, then coax goes to homes (a **hybrid fiber-coax, HFC** system). Uses the **DOCSIS** standard. A **CMTS** (cable modem termination system) at the head end does what the DSLAM does for DSL. Important point: cable is a **shared broadcast medium**. Your neighbors share the same downstream channel, so speed can drop when many people are online.
- **FTTH (Fiber to the Home):** optical fiber runs all the way to the home, giving very high speeds (up to gigabits per second). Often uses **PON (passive optical network)** architecture, where one fiber from the central office is split among many homes using passive optical splitters. An **ONT** (optical network terminator) sits at each home and an **OLT** (optical line terminator) at the central office.
- **5G fixed wireless:** delivers home internet over cellular radio instead of a wire.
- **Ethernet (enterprise and home LANs):** users connect over twisted-pair copper to an Ethernet switch, typically at 100 Mbps to 10 Gbps. Very common in companies and universities.
- **WiFi (IEEE 802.11):** wireless LAN access within tens of meters of an **access point**, which is connected to the wired network.
- **Wide-area wireless (cellular, 4G/5G):** access through a cellular base station, covering kilometers.

A typical home network combines these: a cable or DSL modem, a router, a WiFi access point, and the devices in the home.

### Physical media
Bits travel as signals over a physical medium. Media are either **guided** (signal travels in a solid medium) or **unguided** (signal travels through the air or space).

- **Twisted-pair copper wire:** the cheapest and most common. Two insulated copper wires twisted together to reduce interference. Used in Ethernet (Cat 5e, Cat 6) and phone lines. Can carry 10 Mbps to 10 Gbps depending on distance and wire grade.
- **Coaxial cable:** two concentric copper conductors. Used in cable TV and cable internet. Can carry many channels on different frequencies; it's a shared medium.
- **Fiber optics:** thin glass fiber that carries pulses of light. Very high bit rates (tens to hundreds of Gbps), very low signal loss, immune to electromagnetic interference, and hard to tap. Used for long-haul and undersea links and increasingly to homes. Downside: optical equipment is expensive.
- **Terrestrial radio channels:** no physical wire, can go through walls, supports mobility. Affected by path loss, shadowing, multipath fading and interference. Ranges from very short (Bluetooth) to local (WiFi) to wide area (cellular).
- **Satellite radio channels:** **geostationary** satellites sit at about 36,000 km and have a big signal delay (around 280 ms round-trip to the satellite). **Low-earth orbit (LEO)** satellites are much closer and have lower delay, but you need many of them (constellations like Starlink).

## 1.3 The Network Core

The **network core** is the mesh of packet switches and links that connects the Internet's end systems.

### Packet switching
- Applications exchange **messages**. The source breaks long messages into smaller **packets**.
- Each packet travels through communication links and **packet switches** (routers and link-layer switches).
- If a packet of **L bits** is sent over a link with rate **R bits/sec**, the time to push the whole packet onto the link (the **transmission delay**) is **L/R seconds**.

### Store-and-forward transmission
Most packet switches use **store-and-forward**: the switch must receive the *entire* packet before it can start sending the first bit onto the next link.
- Example: sending one packet of L bits from a source, through one router, to a destination, over two links each of rate R, takes **2L/R** (L/R for each link).
- General result: over a path of **N links** (N−1 routers), each of rate R, the end-to-end delay for one packet is **N·L/R** (ignoring other delays).
- Sending **P packets** back-to-back over N links takes **(N + P − 1)·L/R**, because the packets pipeline through the links.

### Queuing delays and packet loss
- Each router has an **output buffer (queue)** for each attached link.
- If packets arrive faster than the outgoing link can send them, they wait in the queue. This adds **queuing delay**, which varies with how congested the network is.
- Buffers are finite. If a packet arrives when the buffer is full, it gets **dropped**, which is **packet loss**.

### Forwarding tables and routing protocols
- Every end system has an **IP address**, and every packet carries its destination IP address in its header.
- Each router has a **forwarding table** that maps destination addresses (or ranges of them) to the router's outgoing links. When a packet arrives, the router looks up the destination and sends the packet out the right link.
- The forwarding tables are set up by **routing protocols**, which automatically figure out good paths (covered in Chapter 5).
- Analogy: driving to a city by asking at each gas station which highway to take next.

### Circuit switching (the alternative)
- In **circuit switching**, resources (buffer space and link transmission rate) are **reserved** for the whole duration of a communication session. The traditional telephone network works this way.
- Before data flows, the network sets up an end-to-end **circuit** (connection) and guarantees a constant rate.
- Two ways to share a link among circuits:
  - **FDM (Frequency-Division Multiplexing):** the link's frequency spectrum is divided into bands; each circuit gets its own band all the time (like FM radio stations).
  - **TDM (Time-Division Multiplexing):** time is divided into frames, each with fixed slots; each circuit gets one slot in every frame.
- Downside: reserved capacity is **wasted during silent periods** when a user isn't sending anything.

### Packet switching vs. circuit switching
- Packet switching **shares capacity better** and is simpler and cheaper. It allows more users on the same link because users are rarely all active at once.
- Classic example: a 1 Mbps link, users who send at 100 kbps when active but are only active 10% of the time. Circuit switching can support only 10 users. With packet switching, 35 users can share it, and the chance that more than 10 are active at the same moment is tiny (about 0.0004).
- Packet switching is great for **bursty** data, but has unpredictable delays and possible loss, so it's less suited to strict real-time needs without extra mechanisms.
- The Internet uses packet switching.

### A network of networks
How do millions of access ISPs connect so that any two hosts can reach each other? The book builds this up step by step:
- Connecting every access ISP directly to every other would be far too costly.
- Instead there's a hierarchy: access ISPs connect to **regional ISPs**, which connect to **tier-1 ISPs** (large global providers, such as AT&T or Lumen, that don't pay anyone for transit).
- The paying ISP is the **customer**, the one it pays is the **provider**.
- **PoP (Point of Presence):** a group of routers in a provider's network where customer ISPs can connect.
- **Multi-homing:** an ISP connects to two or more providers for reliability.
- **Peering:** two ISPs at the same level connect directly and exchange traffic without paying each other, to save money.
- **IXP (Internet Exchange Point):** a meeting point where many ISPs peer with each other.
- **Content provider networks:** companies like Google run their own private global networks connected directly to lower-tier ISPs and IXPs, bypassing upper tiers where possible.

## 1.4 Delay, Loss, and Throughput in Packet-Switched Networks

### The four types of delay at each router (nodal delay)
As a packet travels from one node (host or router) to the next, it experiences four delays. Their sum is the **nodal delay**:

**d_nodal = d_proc + d_queue + d_trans + d_prop**

- **Processing delay (d_proc):** time to examine the packet's header, decide where to send it, and check for bit errors. Typically microseconds.
- **Queuing delay (d_queue):** time spent waiting in the output buffer for the link to become free. Can be zero or very large; depends on congestion. This is the most interesting and most variable delay.
- **Transmission delay (d_trans = L/R):** time to push all the packet's bits onto the link. Depends on packet length L and link rate R, **not on distance**.
- **Propagation delay (d_prop = d/s):** time for a bit to travel along the link from one end to the other. d is the link's length and s is the propagation speed (about 2×10^8 to 3×10^8 m/s, close to the speed of light). Depends on **distance**, not on packet size.

**Transmission vs. propagation (very commonly tested):**
- Transmission delay = how long it takes to *push* the packet out onto the wire.
- Propagation delay = how long it takes one bit to *travel* across the wire.
- Caravan analogy: cars (bits) in a caravan (packet) go through a tollbooth (router). The time for the tollbooth to let all 10 cars through is like transmission delay; the time for one car to drive the highway to the next tollbooth is like propagation delay.

### Queuing delay and packet loss
- Let **a** be the average rate packets arrive at a queue (packets/sec), **L** the packet size (bits) and **R** the link rate. The **traffic intensity** is **La/R**.
- If **La/R > 1**, bits arrive faster than they can be sent, and the queue grows without limit (delay approaches infinity). **Design rule: traffic intensity must stay below 1.**
- If La/R is close to 0, queuing delay is small. As La/R approaches 1, average queuing delay rises very sharply.
- Because real queues are finite, packets that arrive to a full queue are **lost**. The fraction of lost packets increases as traffic intensity increases. Lost packets may be retransmitted by the sender or the application.

### End-to-end delay
For N−1 routers between source and destination with no congestion (so no queuing), the end-to-end delay is:

**d_end-end = N·(d_proc + d_trans + d_prop)**

On top of this, end systems may add their own delays (for example, media packetization in voice-over-IP).

### Traceroute
**Traceroute** is a tool that shows the route to a destination and the delays to each router. It sends special packets; each router along the path sends a message back. The source measures the round-trip time to each router, sending three probes per router. This reveals the path and where delays happen. Sometimes a later router shows less delay than an earlier one, because queuing delays vary from moment to moment.

### Throughput
- **Throughput** is the rate (bits/sec) at which the receiver actually gets data. **Instantaneous throughput** is the rate at any moment; **average throughput** is the total bits divided by the total time.
- For a simple path of two links with rates R_s and R_c, throughput = **min(R_s, R_c)**: the rate of the slowest link.
- For a path of N links: throughput = **min(R_1, R_2, …, R_N)**. The slowest link is called the **bottleneck link**.
- To transfer a file of F bits, the time is roughly **F / min(R_1, …, R_N)**.
- In practice, the bottleneck is usually the **access network**, because the core is heavily over-provisioned. But if a core link is shared by many flows (for example, 10 downloads sharing a link of rate R), each flow gets about R/10, which can become the bottleneck.

## 1.5 Protocol Layers and Their Service Models

### Why layers?
Networking is complicated, so it's organized into **layers**. Each layer provides a **service** to the layer above it by doing certain actions within the layer and using the services of the layer below. Airline analogy: ticketing, baggage, gates, takeoff/landing and flight routing are separate "layers," each relying on the one below.

**Advantages:** breaks a complex system into manageable parts; makes it easy to change the implementation of one layer without affecting others (modularity).
**Drawbacks:** one layer may duplicate functions of another (error recovery at several layers), and one layer may need information hidden in another layer.

### The five-layer Internet protocol stack (top to bottom)
1. **Application layer:** where network applications and their protocols live: HTTP (web), SMTP (email), DNS (names), FTP. Packets at this layer are called **messages**.
2. **Transport layer:** carries application messages between application endpoints (processes). Two protocols: **TCP** (reliable, connection-oriented, flow and congestion control) and **UDP** (connectionless, no-frills). Packets here are **segments**.
3. **Network layer:** moves network-layer packets, called **datagrams**, from one host to another across the network. Includes the **IP protocol** (defines datagram fields and how routers act on them; there's only one IP, and every Internet device with a network layer must run it) and **routing protocols** that decide routes.
4. **Link layer:** moves a packet from one node (host or router) to the **next node** on the route. Examples: Ethernet, WiFi, DOCSIS. Packets here are **frames**.
5. **Physical layer:** moves the individual **bits** within a frame from one node to the next. Depends on the medium (twisted pair, coax, fiber).

Memory aid: **messages → segments → datagrams → frames → bits**.

### The OSI model
The older **ISO OSI reference model** has **seven layers**: application, **presentation**, **session**, transport, network, data link, physical.
- **Presentation layer:** lets apps interpret the meaning of exchanged data (compression, encryption, data description).
- **Session layer:** delimits and synchronizes data exchange (checkpointing and recovery).
- The Internet doesn't have these two as separate layers; if an app needs those services, the app developer builds them into the application.

### Encapsulation
- As data moves **down** the stack at the sender, each layer adds its own **header** information:
  - The application creates a message M.
  - The transport layer adds a header H_t → a **segment**.
  - The network layer adds H_n → a **datagram**.
  - The link layer adds H_l → a **frame**.
- At each layer, a packet has a **header** and a **payload** (the packet from the layer above).
- At the receiver, each layer removes its header and passes the payload up (**decapsulation**).
- Routers implement only layers 1 to 3 (physical, link, network); **link-layer switches** implement only layers 1 and 2. **Hosts implement all five layers.** This keeps the network core simpler and puts the complexity at the edges.

## 1.6 Networks Under Attack

The Internet was originally designed for a group of mutually trusting users, so security was added later. The main kinds of attacks:

- **Malware:** malicious software that gets onto devices and can delete files, spy on users, or collect private information. Infected devices can be enrolled into a **botnet**, a network of compromised machines that the attacker controls and uses for spam or attacks.
  - Much malware is **self-replicating**: once it infects one host, it looks for other hosts to infect, so it spreads exponentially.
  - **Viruses** need user interaction to infect (e.g., opening an email attachment).
  - **Worms** spread with no user interaction (e.g., exploiting a vulnerable network application).
- **Denial-of-Service (DoS) attacks:** make a network, host or service unusable by legitimate users. Three kinds:
  - **Vulnerability attack:** send a few carefully crafted messages that crash a vulnerable app or operating system.
  - **Bandwidth flooding:** send a huge number of packets so the target's access link is clogged.
  - **Connection flooding:** open a huge number of half-open or fully open TCP connections so the target stops accepting legitimate connections.
  - **DDoS (Distributed DoS):** the attacker uses many sources, often a botnet of thousands of machines, to flood the target. Much harder to detect and defend against than a single-source attack.
- **Packet sniffing:** a passive receiver records a copy of every packet passing by. Especially easy on wireless networks and shared broadcast media. Sniffers are hard to detect because they don't send anything. Defense: **encryption**. Tool example: Wireshark.
- **IP spoofing:** injecting packets with a **false source address**, so the receiver is fooled about who sent them. Defense: **end-point authentication**, a way to be sure a message really came from where you think (Chapter 8).

## 1.7 History of Computer Networking and the Internet

- **1961–1972: early packet switching.** Leonard Kleinrock (MIT) used queuing theory to show the effectiveness of packet switching for bursty traffic. Paul Baran (RAND) and Donald Davies (UK) also developed packet-switching ideas. **ARPAnet**, the first packet-switched computer network and the ancestor of the Internet, connected its first nodes in 1969 (UCLA was first). By 1972 it had about 15 nodes. **NCP** was the first host-to-host protocol, and the first email program was written in 1972.
- **1972–1980: proprietary networks and internetworking.** Other networks appeared: ALOHAnet (a packet radio network in Hawaii), Telenet, Cyclades, Xerox's network. **Vinton Cerf and Robert Kahn** developed an architecture for interconnecting networks: **"internetting"**. This produced **TCP**, and later TCP was split so that **IP** handled addressing and forwarding and **UDP** was added for apps that didn't need reliability. **Ethernet** was created by Bob Metcalfe at Xerox PARC, building on ALOHA's ideas.
- **1980–1990: a proliferation of networks.** On **January 1, 1983**, ARPAnet officially switched over to **TCP/IP**. TCP congestion control was added in the late 1980s (Van Jacobson). **DNS** was developed to map names to IP addresses. **NSFNET** connected universities and became a main backbone.
- **The 1990s: an explosion.** ARPAnet was decommissioned (1990) and NSFNET was opened to commercial traffic, then decommissioned in 1995 with backbone traffic carried by commercial ISPs. The killer app was the **World Wide Web**, invented by **Tim Berners-Lee** at CERN (HTML, HTTP, a web server and browser). Graphical browsers like Mosaic and Netscape made the Web popular. The late 1990s had huge growth: email, instant messaging, peer-to-peer file sharing, and the dot-com boom.
- **The new millennium.** Big trends: fast **broadband** home access; high-speed **wireless** and mobile devices (smartphones outnumber wired devices); **online social networks** (Facebook, etc.); **content providers** like Google and Microsoft deploying private global networks and huge data centers; **cloud computing** (Amazon, Microsoft, Google) letting companies rent computing and storage.

## Key terms
- **Host / end system:** a device at the edge of the network that runs applications.
- **Packet switch:** a device (router or link-layer switch) that forwards packets.
- **Protocol:** the agreed format, order of messages and actions between communicating parties.
- **ISP:** Internet Service Provider.
- **Access network:** the network connecting a host to its first (edge) router.
- **Store-and-forward:** a switch receives the whole packet before forwarding it.
- **Transmission delay (L/R):** time to push a packet's bits onto a link.
- **Propagation delay (d/s):** time for a bit to travel across a link.
- **Queuing delay:** time a packet waits in a router's buffer.
- **Traffic intensity (La/R):** load on a link; must be below 1.
- **Throughput:** the rate at which data is actually delivered; limited by the bottleneck link.
- **Circuit switching:** reserving resources end-to-end for a connection (FDM or TDM).
- **Encapsulation:** each layer adding its header to the data from the layer above.
- **IXP:** Internet exchange point, where ISPs peer.
- **Botnet:** a network of compromised computers controlled by an attacker.
- **DDoS:** a denial-of-service attack from many sources at once.

## Quick review
- Know the four delays and what each one depends on (size vs. distance vs. congestion).
- Be able to compute L/R, d/s, N·L/R and file transfer time with a bottleneck link.
- Remember the five layers, their packet names and an example protocol for each.
- Understand why packet switching beats circuit switching for bursty traffic.
