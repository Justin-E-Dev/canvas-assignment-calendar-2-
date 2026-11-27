# Chapter 7: Wireless and Mobile Networks

There are now far more wireless and mobile devices connected to the Internet than wired ones. This chapter covers two related but separate challenges. **Wireless** is about communicating over a wireless link, which behaves very differently from a wire. **Mobility** is about handling a user who changes their point of attachment to the network while staying connected. It covers wireless link characteristics, WiFi (802.11), Bluetooth, 4G/5G cellular networks, the principles of mobility management, how mobility is handled in practice in cellular networks and Mobile IP, and how wireless and mobility affect higher-layer protocols like TCP.

## 7.1 Introduction

### Elements of a wireless network
- **Wireless hosts:** end-system devices that run applications: laptops, smartphones, tablets, IoT devices, cars. The host itself may or may not be mobile.
- **Wireless links:** a host connects to a base station or to another wireless host through a wireless communication link. Different technologies have different transmission rates and can transmit over different distances.
- **Base station:** a key part of the wireless network infrastructure, with no obvious counterpart in a wired network. It's responsible for sending and receiving data (packets) to and from the wireless hosts associated with it, and often coordinates the transmissions of those hosts. Examples: **cell towers** in cellular networks and **access points (APs)** in 802.11 WiFi LANs.
  - Hosts associated with a base station are said to be operating in **infrastructure mode**, since all traditional network services (like address assignment and routing) are provided by the network the host is connected to via the base station.
  - When a mobile host moves beyond the range of one base station into another's range, it changes its point of attachment: a process called **handoff** or **handover**.
- **Network infrastructure:** the larger network a wireless host may want to communicate with.

### Ad hoc networks
- In **ad hoc networks**, wireless hosts have **no infrastructure** to connect to. The hosts themselves must provide services like routing, address assignment and DNS-like name translation.
- **MANETs (mobile ad hoc networks):** multi-hop, no infrastructure. **VANETs (vehicular ad hoc networks):** vehicles communicate with each other and with roadside units.

### Classifying wireless networks
Two questions: does a packet cross exactly **one** wireless hop or **multiple** hops, and is there **infrastructure** (like a base station) or not?
- **Single-hop, infrastructure-based:** a base station connected to a larger wired network (like the Internet). All communication is between the base station and the wireless host over a single wireless hop. **Examples: 802.11 WiFi in a classroom or café; 4G LTE.** Most everyday wireless use is in this category.
- **Single-hop, infrastructure-less:** no base station connected to a wireless network, but one node may coordinate the others. **Example: Bluetooth networks.**
- **Multi-hop, infrastructure-based:** a base station is wired to the larger network, but some wireless nodes may have to relay their communication through other wireless nodes to reach it. **Examples: some wireless sensor networks and wireless mesh networks.**
- **Multi-hop, infrastructure-less:** no base station; nodes may have to relay messages through several other nodes to reach a destination. Nodes may also be mobile, with connectivity changing among nodes. **Examples: MANETs, VANETs.**

## 7.2 Wireless Links and Network Characteristics

### How wireless links differ from wired ones
- **Decreasing signal strength (path loss):** electromagnetic radiation weakens as it passes through matter (like a radio signal passing through a wall), and even in free space the signal disperses, decreasing in strength as the distance between sender and receiver increases.
- **Interference from other sources:** radio sources transmitting in the same frequency band will interfere with each other. For example, 2.4 GHz wireless phones and 802.11b WiFi LANs transmit in the same band. Electromagnetic noise in the environment (like a nearby motor or a microwave oven) can also cause interference.
- **Multipath propagation:** occurs when portions of the electromagnetic wave reflect off objects and the ground, taking paths of different lengths between sender and receiver. This blurs the received signal at the receiver. Moving objects between the sender and receiver can cause multipath propagation to change over time.

These make **bit errors far more common on wireless links than wired ones**. So wireless link protocols (like 802.11) use not only powerful **CRC** error-detection codes, but also **link-level reliable data transfer** protocols that retransmit corrupted frames.

### SNR and BER
- The receiver gets an electromagnetic signal that is a combination of a degraded form of the original transmitted signal and background noise.
- **SNR (signal-to-noise ratio):** a relative measure of the strength of the received signal (the information being transmitted) compared to this noise. Usually measured in **decibels (dB)**: 20 × log10 of the ratio of the received signal's amplitude to the noise's amplitude. A **larger SNR** makes it easier for the receiver to extract the transmitted signal from the background noise.
- **BER (bit error rate):** roughly, the probability that a transmitted bit is received in error at the receiver.
- Three important points from graphs of BER vs. SNR for different modulation techniques:
  1. **For a given modulation scheme, a higher SNR gives a lower BER.** A sender can increase SNR by increasing its transmission power, so it can decrease the probability that a frame is received in error. But more power costs energy (important for battery-powered devices) and may interfere more with other senders.
  2. **For a given SNR, a modulation technique with a higher bit transmission rate will have a higher BER.** For example, with an SNR of 10 dB, **BPSK** (binary phase shift keying, 1 Mbps) has a BER of less than 10^-7, while **QAM16** (quadrature amplitude modulation with 16 levels, 4 Mbps) has a BER of 10^-1, far too high to be practical.
  3. **Dynamic selection of the physical-layer modulation technique** can be used to adapt the modulation to channel conditions: choose the modulation that gives the highest transmission rate possible subject to a BER constraint, given the current SNR. This rate adaptation is used in 802.11 and 4G/5G cellular.

### The hidden terminal problem and fading
- Wireless links have another important difference from wired broadcast links: not every station can hear every other station's transmissions.
- **Hidden terminal problem:** stations A and C both transmit to B. Because of a physical obstruction (like a mountain or building) between A and C, **A and C can't hear each other's transmissions**, even though both their transmissions reach B and **interfere at B**. So A and C can't detect a collision by carrier sensing.
- **Fading:** a signal's strength decreases as it propagates through the wireless medium. Even without obstacles, if A and C are placed so their signals aren't strong enough to detect each other, but strong enough to interfere at B, the same problem occurs.
- These make multiple access in a wireless network much more complex than in a wired one.

### CDMA (Code Division Multiple Access)
- A channel partitioning protocol often used in wireless LAN and cellular technologies.
- Each bit being sent is encoded by multiplying it by a signal (the **code**) that changes at a much faster rate (the **chipping rate**) than the original data bits.
- **Encoding:** the sender's data bit d_i (+1 or −1) is multiplied by each of the M values (chips) of its code c_1…c_M. So each data bit becomes M values: **Z_i,m = d_i · c_m**.
- **Decoding:** the receiver recovers the bit by computing the **inner product** of the received signal with the code, then dividing by M:
  **d_i = (1/M) · Σ_m Z_i,m · c_m**
- **With multiple senders:** the received signal is the sum of all senders' encoded bits. If the senders' codes are chosen carefully (each **orthogonal** to the others, so their inner product is 0), each receiver can recover the data sent by a given sender out of the aggregate signal, simply by using that sender's code in the decoding formula above. The other senders' contributions cancel out.
- Analogy: a crowded room where people speak different languages; you can understand the person speaking your language even though everyone is speaking at once.

## 7.3 WiFi: 802.11 Wireless LANs

- **IEEE 802.11 wireless LANs**, also known as **WiFi**, are found everywhere: homes, offices, schools, cafés, airports.
- There are many versions of the standard. They all use the **same medium access protocol (CSMA/CA)**, the **same frame structure**, the ability to reduce their transmission rate to reach farther, and are backward compatible (e.g., a device that only supports 802.11g can still interact with a newer 802.11ax base station). They differ mainly at the physical layer:
  - **802.11b:** 2.4 GHz, up to 11 Mbps.
  - **802.11g:** 2.4 GHz, up to 54 Mbps.
  - **802.11n (WiFi 4):** 2.4/5 GHz, up to 600 Mbps; uses **MIMO (multiple-input multiple-output) antennas**: two or more antennas on the sending side and two or more on the receiving side, transmitting/receiving different signals.
  - **802.11ac (WiFi 5):** 5 GHz, up to 3.47 Gbps.
  - **802.11ax (WiFi 6):** 2.4/5 GHz, up to 14 Gbps.
  - **802.11af / 802.11ah:** TV bands (54–790 MHz) and 900 MHz, for longer range and IoT.
- Bands: **2.4–2.485 GHz** (unlicensed, shared with 2.4 GHz phones and microwave ovens) and **5.1–5.8 GHz** (shorter range for a given power, more affected by multipath).

### The 802.11 architecture
- The fundamental building block is the **basic service set (BSS)**: one or more wireless stations and a central **base station**, known as an **access point (AP)**.
- In a typical home network, there's one AP and one router (often combined into one unit) connecting the BSS to the Internet.
- Each 802.11 wireless station has a 6-byte **MAC address** stored in the firmware of its adapter. Each AP also has a MAC address for its wireless interface. These are administered by IEEE and are (in theory) globally unique.
- **Infrastructure wireless LANs:** wireless LANs that deploy APs. Stations can also group together to form an **ad hoc network**, with no central control and no connection to the "outside world."

### Channels and association
- When a network administrator installs an AP, they assign a one- or two-word **Service Set Identifier (SSID)** to the AP (the name you see when you scan for networks).
- They must also assign a **channel number**. In the 2.4–2.4835 GHz range, 802.11 defines **11 partially overlapping channels**. Two channels are non-overlapping if and only if they're separated by **four or more channels**. In particular, **channels 1, 6 and 11** are the only set of three non-overlapping channels. So an administrator could create a wireless LAN with an aggregate maximum rate of three times the max rate by installing three APs at the same physical location, using channels 1, 6 and 11.
- **WiFi jungle:** any physical location where a wireless station receives a sufficiently strong signal from two or more APs (for example, a café with its own AP plus APs from neighboring apartments).
- **Association:** to get Internet access, a wireless device needs to join exactly one of the subnets, and so needs to **associate** with exactly one of the APs. Associating means creating a virtual wire between the device and the AP. Only the associated AP will send data frames (frames containing data, like a datagram) to the device, and the device will send data frames into the Internet only through the associated AP.
- **How does a device learn which APs are out there?**
  - **Passive scanning:** an AP periodically sends **beacon frames**, each including the AP's SSID and MAC address. The device scans the 11 channels, looking for beacon frames from any APs that may be out there. Once it learns about available APs, it selects one to associate with (typically the one with the highest signal strength).
  - **Active scanning:** the device broadcasts a **probe request frame** that will be received by all APs within its range. APs respond with a **probe response frame**. The device then chooses an AP.
- After selecting the AP, the device sends an **association request frame** to the AP, and the AP responds with an **association response frame**.
- Once associated with an AP, the device will want to join the subnet (in the IP sense) the AP belongs to. So it typically sends a **DHCP** discovery message into the subnet via the AP to get an IP address on the subnet.
- Authentication: the AP may require the device to authenticate itself. Approaches: allowing access based on a device's MAC address, or using usernames and passwords, often with a central authentication server (using a protocol like **RADIUS** or **DIAMETER**) (covered in Chapter 8).

### The 802.11 MAC protocol: CSMA/CA
- Since multiple wireless devices or the AP may want to transmit data frames over the same channel at the same time, a multiple access protocol is needed. 802.11 uses a random access protocol called **CSMA with collision avoidance (CSMA/CA)**.
- Like Ethernet's CSMA/CD, each station senses the channel before transmitting and refrains from transmitting when it senses the channel busy.
- Two important differences from Ethernet:
  1. **Collision avoidance instead of collision detection.** 802.11 doesn't implement collision detection, for two reasons:
     - The ability to detect collisions requires the ability to send (the station's own signal) and receive (to see whether another station is also transmitting) at the same time. Because the strength of the received signal is typically very small compared to the strength of the transmitted signal at the adapter, it's costly to build hardware that can detect a collision.
     - Even if the adapter could transmit and listen at the same time (and presumably abort if it senses the channel busy), it still wouldn't be able to detect all collisions, because of the **hidden terminal problem** and **fading**.
     - So once a station begins to transmit a frame, **it transmits the frame in its entirety**; there's no aborting. Because collisions are not detected and entire frames are always sent, performance can degrade significantly when collisions occur. So 802.11 uses several techniques to avoid them.
  2. **Link-layer acknowledgment/retransmission (ARQ),** because of the relatively high bit error rates of wireless channels.

**Link-layer acknowledgments:**
- When the destination station receives a frame that passes the CRC, it waits a short period of time known as the **Short Inter-frame Spacing (SIFS)** and then sends back an **acknowledgment frame**.
- If the transmitting station doesn't receive an acknowledgment within a given amount of time, it assumes an error has occurred and **retransmits** the frame, using the CSMA/CA protocol to access the channel. If an acknowledgment isn't received after some fixed number of retransmissions, the transmitting station gives up and discards the frame.

**The CSMA/CA protocol (a station has a frame to transmit):**
1. If initially the station senses the channel is idle, it transmits its frame after a short period of time known as the **Distributed Inter-frame Space (DIFS)**.
2. Otherwise, the station chooses a random **backoff value** using **binary exponential backoff** (as in Ethernet) and counts down this value **only when the channel is sensed idle** (DIFS). While the channel is sensed busy, the counter value remains frozen.
3. When the counter reaches zero (note that this can only occur while the channel is sensed idle), the station transmits the entire frame and then waits for an acknowledgment.
4. If an acknowledgment is received, the transmitting station knows its frame has been correctly received at the destination station. If the station has another frame to send, it begins the CSMA/CA protocol at step 2. If the acknowledgment isn't received, the transmitting station reenters the backoff phase in step 2, with the random value chosen from a **larger interval**.

**Why count down even when the channel is idle (unlike Ethernet, which transmits as soon as the channel is idle)?**
- In CSMA/CD, the goal is to transmit as soon as possible when the channel is idle. In CSMA/CA, the goal is to **avoid collisions whenever possible**.
- Example: two stations each have a frame to send, but neither transmits immediately because each senses a third station is already transmitting. With Ethernet's CSMA/CD, both stations would each transmit as soon as they detect the third station has finished, which would cause a collision. Collisions aren't a serious issue in CSMA/CD (both stations abort quickly), but they are serious in 802.11, since 802.11 doesn't detect a collision and abort.
- In 802.11, if the two stations choose **different random backoff values**, the station with the smaller value will "win the race" and begin transmitting first, while the "losing station" hears the "winning station's" signal, freezes its counter and refrains from transmitting until the winning station has finished.
- Collisions can still occur: if the two stations are hidden from each other, or if they choose random backoff values close enough to each other that the transmission from the station starting first has yet to reach the second station.

**Dealing with hidden terminals: RTS and CTS**
- 802.11 includes an optional reservation scheme to help avoid collisions even in the presence of hidden terminals.
- A sending station sends a short **Request to Send (RTS)** control frame to the AP, indicating the total time required to transmit the DATA frame and the acknowledgment (ACK) frame.
- When the AP receives the RTS frame, it responds by broadcasting a **Clear to Send (CTS)** control frame. This CTS frame serves two purposes: it gives the sender explicit permission to send, and it instructs the other stations **not to send for the reserved duration**.
- The use of RTS and CTS frames can improve performance in two important ways:
  - The **hidden station problem is mitigated**, since a long DATA frame is transmitted only after the channel has been reserved (other stations hear the CTS, even if they can't hear the RTS).
  - Because the RTS and CTS frames are short, a collision involving an RTS or CTS frame lasts only for the duration of the short RTS or CTS frame. Once the RTS and CTS frames are correctly transmitted, the following DATA and ACK frames should be transmitted without collisions.
- Downside: RTS/CTS introduces delay and consumes channel resources. So it's typically only used to reserve the channel for the transmission of a **long DATA frame**. In practice, each wireless station can set an **RTS threshold** so that the RTS/CTS sequence is used only when the frame is longer than the threshold. For many wireless stations, the default threshold is larger than the maximum frame length, so RTS/CTS is skipped for all data frames.

**Using 802.11 as a point-to-point link:** if two nodes each have a directional antenna, they can point their antennas at each other and run 802.11 over what is essentially a point-to-point link. Given the low cost of commodity 802.11 hardware, using directional antennas and increased transmission power lets 802.11 be an inexpensive means of providing wireless point-to-point connections over tens of kilometers.

### The IEEE 802.11 frame
- Although the 802.11 frame shares many similarities with an Ethernet frame, it also contains fields specific to its use for wireless links.
- **Payload and CRC fields:** at the heart of the frame is the payload, which typically consists of an IP datagram or an ARP packet. Although the field may be up to 2,312 bytes, it's typically fewer than 1,500 bytes (holding an IP datagram or ARP packet). As with Ethernet, the frame includes a 32-bit **CRC** so the receiver can detect bit errors.
- **Address fields:** the most striking difference is that the 802.11 frame has **four address fields**, each of which can hold a 6-byte MAC address. Three are needed for internetworking purposes, specifically for moving the network-layer datagram from a wireless station through an AP to a router interface. The fourth is used when APs forward frames to each other in ad hoc mode.
  - **Address 1:** the MAC address of the **wireless station that is to receive** the frame. If a mobile wireless station transmits the frame, address 1 contains the MAC address of the destination AP; if an AP transmits it, address 1 contains the destination wireless station's MAC address.
  - **Address 2:** the MAC address of the **station that transmits** the frame. If a wireless station transmits the frame, its own MAC address goes in address 2; if an AP transmits it, the AP's MAC address goes there.
  - **Address 3:** contains the MAC address of the **router interface** (or other interface in the subnet). The BSS (consisting of the AP and wireless stations) is part of a subnet, and this subnet connects to other subnets via some router interface. Address 3 contains the MAC address of this router interface.
  - **Why address 3 is needed (example):** a router wants to send a datagram to a wireless station H1. The router knows H1's IP address, and uses ARP to determine H1's MAC address, just as in an ordinary Ethernet LAN. The router encapsulates the datagram in an **Ethernet frame** with H1's MAC address as the destination and its own interface's MAC address (R1) as the source. When the AP receives it, it converts the Ethernet frame into an 802.11 frame before transmitting it into the wireless channel: address 1 = H1's MAC, address 2 = the AP's own MAC, **address 3 = R1's MAC**. This way, H1 can determine (from address 3) the MAC address of the router interface that sent the datagram into the subnet. The reverse works similarly: H1 sends a frame with address 1 = AP, address 2 = H1, address 3 = R1, and the AP converts it to an Ethernet frame with source H1 and destination R1. **The AP is a link-layer device: it neither "sees" the IP datagram nor understands it.**
- **Sequence number, duration and frame control fields:**
  - **Sequence number:** in 802.11, a station sends an ACK when it correctly receives a frame. Because ACKs can be lost, the sending station may send multiple copies of a given frame. Sequence numbers let the receiver distinguish between a newly transmitted frame and the retransmission of a previous frame (just like in the rdt protocols from Chapter 3).
  - **Duration:** the frame includes a value for the time it reserves the channel for: the time to transmit its data frame and the time to transmit an ACK (part of the RTS/CTS reservation).
  - **Frame control:** includes many subfields: **type and subtype** distinguish association, RTS, CTS, ACK and data frames; **to and from** define the meanings of the address fields; **WEP** indicates whether encryption is being used.

### Mobility in the same IP subnet
- To increase the physical range of a wireless LAN, companies and universities often deploy **multiple BSSs within the same IP subnet**. This raises the issue of mobility among the BSSs: how do wireless stations seamlessly move from one BSS to another while maintaining ongoing TCP sessions?
- When the BSSs are part of the same subnet, mobility can be handled in a relatively straightforward way. The two APs are connected by a **switch**.
- As host H1 moves away from AP1, it detects a weakening signal from AP1 and starts to scan for a stronger signal. H1 receives beacon frames from AP2 (which in many corporate and university settings has the same SSID as AP1). H1 then **disassociates** from AP1 and **associates** with AP2, while keeping its IP address and maintaining its ongoing TCP sessions.
- **The switch problem:** switches are "self-learning" and automatically build their forwarding tables. This feature nicely handles occasional moves (like an employee being transferred to another department), but switches weren't designed to support highly mobile users who want to maintain TCP connections while moving between BSSs. Before the move, the switch has an entry in its forwarding table pairing H1's MAC address with the outgoing switch interface through which H1 can be reached (toward AP1). If H1 is initially in BSS1, a datagram destined to H1 will be directed to H1 via AP1. Once H1 associates with BSS2, however, its frames should be directed to AP2.
- **Solution:** after the new association, AP2 sends a **broadcast Ethernet frame with H1's source address** to the switch just after the new association. When the switch receives the frame, it updates its forwarding table, allowing H1 to be reached via AP2.

### Advanced features in 802.11
- **802.11 rate adaptation:** some 802.11 implementations have a rate adaptation capability that adaptively selects the underlying physical-layer modulation technique to use based on current or recent channel characteristics. If a node sends **two frames in a row without receiving an acknowledgment** (an implicit indication of bit errors on the channel), the transmission rate **falls back to the next lower rate**. If **10 frames in a row are acknowledged**, or if a timer that tracks the time since the last fallback expires, the transmission rate **increases to the next higher rate**. This rate adaptation mechanism shares the same "probing" philosophy as TCP's congestion-control mechanism (Chapter 3).
- **Power management:** power is a precious resource in mobile devices. 802.11 provides power-management capabilities that let nodes minimize the amount of time their sense, transmit and receive functions and other circuitry need to be "on." A node can explicitly alternate between **sleep and wake states**. A node indicates to the AP that it will be going to sleep by setting the power-management bit in an 802.11 frame header to 1. A timer in the node is then set to wake up the node just before the AP is scheduled to send its **beacon frame** (typically every 100 ms). Since the AP knows from the set power-transmission bit that the node is going to sleep, it knows it should not send any frames to that node, and will **buffer** any frames destined for the sleeping host for later transmission. A node will wake up just before the AP sends a beacon frame and quickly enter the fully active state (in as little as 250 microseconds). The beacon frames sent by the AP contain a list of nodes whose frames have been buffered at the AP. If there are no buffered frames for the node, it can go back to sleep. Otherwise, the node can explicitly request the buffered frames be sent by sending a polling message to the AP. With an inter-beacon time of 100 ms, a wakeup time of 250 microseconds and a similarly small time to receive a beacon frame and check that there are no buffered frames, a node that has no frames to send or receive can be **asleep 99% of the time**, resulting in significant energy savings.

### Personal area networks: Bluetooth
- **Bluetooth** networks are low-power, short-range, low-rate, **"cable replacement"** technologies: used for interconnecting a computer with its wireless keyboard, mouse, headphones or other peripherals. They're sometimes referred to as **wireless personal area networks (WPANs)**.
- Bluetooth operates over short range, at low power and at low cost. It's essentially a **low-power, short-range, low-rate "cable replacement."**
- Operates in the unlicensed 2.4 GHz radio band in a **TDM** manner, with time slots of 625 microseconds. During each time slot, a sender transmits on one of **79 channels**, with the channel changing in a known but pseudo-random manner from slot to slot. This form of channel hopping, known as **frequency-hopping spread spectrum (FHSS)**, spreads transmissions in time over the frequency spectrum. Bluetooth can provide data rates up to 3 Mbps.
- Bluetooth networks are **ad hoc networks**: no network infrastructure (like an AP) is needed to interconnect Bluetooth devices. Thus, Bluetooth devices must organize themselves.
- Bluetooth devices are first organized into a **piconet** of up to **eight active devices**. One of these devices is designated as the **controller** (traditionally called the master), with the remaining devices acting as **clients**. The controller node truly rules the piconet: its clock determines time in the piconet, it can transmit in each odd-numbered slot, and a client can transmit only after the controller has communicated with it in the previous slot, and even then the client can only transmit to the controller. In addition to the client devices, there can also be up to **255 parked devices** in the network. These devices can't communicate until their status has been changed from parked to active by the controller node.

## 7.4 Cellular Networks: 4G and 5G

- Cellular networks provide Internet access to mobile users everywhere: on the move, in cars, at home. **4G** networks are pervasive, and **5G** is being deployed.
- The term **cellular** refers to the fact that the region covered by a cellular network is partitioned into a number of geographic coverage areas, known as **cells**. Each cell contains a **base station** that transmits signals to and receives signals from the mobile devices currently in its cell.

### 4G LTE architecture: network elements
- **Mobile device:** a smartphone, tablet, laptop or IoT device that connects to the cellular network. The mobile device has a 64-bit **International Mobile Subscriber Identity (IMSI)**, stored on its **SIM (Subscriber Identity Module)** card. The IMSI identifies the subscriber in the worldwide cellular carrier network system, including the country and the subscriber's home cellular carrier network. The mobile device is also referred to as **UE (user equipment)** in 4G LTE jargon. The mobile device runs the network protocol stack and gets an IP address.
- **Base station:** sits at the "edge" of the carrier's network and is responsible for managing the wireless radio resources and the mobile devices within its coverage area (a **cell**). Called an **eNode-B** in LTE. A mobile device interacts with a base station to attach to the carrier's network. The base station coordinates device authentication and allocation of resources (channel access) in its cell. In this sense, cellular base station functions are similar (but by no means identical) to those of APs in wireless LANs. Base stations also: create **device-specific IP tunnels** from the mobile device to gateways and act as relays between them; coordinate among themselves to handle device mobility between cells; and coordinate with nearby base stations to manage the radio spectrum to minimize interference between cells.
- **Home Subscriber Server (HSS):** a **control-plane** element. The HSS is a database that stores information about the mobile devices for which the HSS's network is their **home network**. It's used in conjunction with the MME for device authentication.
- **Serving Gateway (S-GW), Packet Data Network Gateway (P-GW) and other network routers:** the S-GW and the P-GW are two routers (often colocated in practice) that lie on the **data path** between the mobile device and the Internet. The **P-GW** also allocates IP addresses to mobile devices and performs NAT. The P-GW is the last LTE element that a datagram originating at a mobile device encounters before entering the larger Internet. To the outside world, the P-GW looks like any other gateway router; the mobility of the mobile nodes within the cellular carrier's LTE network is hidden from the outside world behind the P-GW.
- **Mobility Management Entity (MME):** also a **control-plane** element. Along with the HSS, it plays an important role in **authenticating** a device wanting to connect to its network. It also sets up the **tunnels** on the data path from/to the device and the P-GW, and maintains information about an active mobile device's cell location within the carrier's cellular network. But, as shown, it's not in the forwarding path of the mobile device's datagrams.
- **Authentication:** it's important for the network and the mobile device attaching to the network to **mutually authenticate** each other: for the network to know that the attaching device is indeed the device associated with a given IMSI, and for the mobile device to know that the network it's attaching to is a legitimate cellular carrier network.

### LTE protocol stacks
- LTE's architecture separates the **data plane** (the path that user datagrams take) and the **control plane** (signaling and management).
- **Link layer** in LTE is split into three sublayers:
  - **Packet Data Convergence:** this uppermost sublayer of the link layer sits just below IP. It performs IP header/compression to decrease the number of bits sent over the wireless link, and encryption/decryption of the IP datagram using keys established via signaling messages between the LTE mobile device and the MME when the device first attaches to the network.
  - **Radio Link Control (RLC):** performs two important functions: (i) **fragmenting** (on the sending side) and **reassembling** (on the receiving side) IP datagrams that are too large to fit into the underlying link-layer frames, and (ii) **link-layer reliable data transfer** at the RLC level through the use of an ACK/NAK-based ARQ protocol.
  - **Medium Access (MAC):** performs transmission scheduling, that is, the requesting and use of the radio transmission slots. The MAC sublayer also performs additional error detection/correction functions, including the use of redundant bit transmission as a forward error-correction technique. The amount of redundancy can be adapted to channel conditions.
- **Tunneling:** user datagrams are tunneled from the base station to the S-GW and P-GW using **GTP (GPRS Tunneling Protocol)**, carried over UDP. The data path between the mobile device and the P-GW is thus: device → (radio link) → base station → (GTP tunnel) → S-GW → (GTP tunnel) → P-GW → Internet.

### LTE radio access network
- LTE uses a combination of **frequency division multiplexing and time division multiplexing** on the downstream channel, known as **orthogonal frequency division multiplexing (OFDM)**. (The term "orthogonal" comes from the fact that the signals being sent on different frequency channels are created so that they interfere very little with each other, even when channel frequencies are tightly spaced.)
- In LTE, each active mobile device is allocated **one or more 0.5 ms time slots in one or more of the channel frequencies**. The more time slots a mobile node is allocated (whether on the same or different frequencies), the higher the transmission rates it can achieve. Slot (re)allocation among mobile devices can be performed as often as once every millisecond. Different modulation schemes can also be used to change the transmission rate.
- The particular allocation of time slots to mobile devices is not mandated by the LTE standard. Instead, the decision of which mobile devices will be allowed to transmit in a given time slot on a given frequency is determined by the **scheduling algorithms** provided by the LTE equipment vendor and/or the network operator. With opportunistic scheduling (matching the physical-layer protocol to channel conditions between the sender and receiver and choosing the receivers to which packets will be sent based on channel conditions), the radio network controller can make the best use of the wireless medium.

### Additional LTE functions: network attachment and power management
- **Network attachment:** the process by which a mobile device attaches to the cellular network has three phases:
  1. **Attachment to a base station:** the mobile device searches for a **primary synchronization signal** that is periodically broadcast every 5 ms on all frequencies by a base station. Once found, it stays on that frequency and locates the secondary synchronization signal. With information found in that signal, the device locates additional information such as channel bandwidth, channel configurations and that base station's cellular carrier information. Armed with this, the mobile device can select a base station to associate with (typically preferring to attach to its home network) and establish control-plane signaling communication with the base station across the wireless hop.
  2. **Mutual authentication:** the base station contacts the local **MME** to perform mutual authentication. The MME uses a combination of the mobile device's IMSI and other information to retrieve authentication information from the HSS in the device's home network. At the end of this, the MME and the mobile device are mutually assured that the device is uniquely identified by its IMSI and that the network it's attaching to is a legitimate cellular carrier network.
  3. **Mobile-device-to-P-GW data plane path configuration:** the MME contacts the P-GW (which also returns a NAT address for the mobile device) and the S-GW, and the base station, to establish the two tunnels.
- **Power management: sleep modes.** Like in 802.11 and Bluetooth, a mobile device in LTE may put its radio to "sleep" to conserve its battery power. After roughly 100 ms of inactivity, it enters a **light sleep state**, waking periodically to check whether there are any downstream transmissions waiting. After roughly 5–10 seconds of inactivity, it enters a **deep sleep state** (an **idle state**), where it no longer has an active association with its base station. When the mobile device is in deep sleep, it may have moved to a new cell, so the network needs to locate the device using **paging**: a broadcast message from all base stations in the area where the device was last known to be.

### The global cellular network: a network of networks
- A user's cellular network is part of a global network of cellular carrier networks. Cellular carriers interconnect with each other and with the public Internet through **gateway routers**, and with each other via **IPX (IP Exchange) networks**.
- **Roaming:** a mobile device's **home network** is the network of the carrier the user subscribes to. When the device is in a **visited network**, it interacts with the visited network's MME and the home network's HSS for authentication. The home network may use a P-GW in the home network or in the visited network.

### 5G cellular networks
- The goal of 5G is to provide much higher data rates and lower latency than 4G. The 5G standard is divided into frequency groups: **FR1 (450 MHz–6 GHz)** and **FR2 (24 GHz–52 GHz)**. Most early deployments are in FR1.
- Three broad types of service:
  - **Enhanced Mobile Broadband (eMBB):** high peak data rates (up to 20 Gbps) and data rates of 100+ Mbps for users at cell edges, for high-bandwidth applications like immersive AR/VR.
  - **Ultra-Reliable Low-Latency Communications (URLLC):** for latency-sensitive applications like factory automation and autonomous driving, targeting latencies of **1 ms**.
  - **Massive Machine Type Communications (mMTC):** a non-broadband application type for narrowband communications for IoT devices, with very large numbers of devices per area.
- **Millimeter wave frequencies:** much of 5G's innovation comes from operating in the FR2 band, also known as **millimeter wave** frequencies. Millimeter waves allow very high data rates over short distances. The downsides: millimeter waves can't penetrate building walls or windows and have a short range, so **small cells** are required, and many more base stations are needed (the base stations being close together, with a small coverage area). Millimeter wave base stations use **beamforming**, using large antenna arrays to direct the signal toward specific users. The 5G base station is called a **gNB**.
- **5G core network:** the 5G core network manages all 5G mobile voice, data and Internet connections. It's being redesigned to better integrate with the Internet and cloud-based services, and includes distributed servers and caches to reduce latency. **Network function virtualization (NFV)** and **network slicing** (different services running on separate "slices" of the network) will be managed in the core. The 5G core decomposes the 4G core: the **User Plane Function (UPF)** handles the data plane (combining 4G's S-GW and P-GW data-plane functions), while control plane functions like **Access and Mobility Management Function (AMF)** (similar to 4G's MME), **Session Management Function (SMF)** and others handle signaling.
- 5G is a "software-defined network": the control and data planes are separated, with **SDN** principles used throughout.

## 7.5 Mobility Management: Principles

### What does "mobility" mean?
- From a network-layer standpoint, there's a spectrum of mobility:
  - **No mobility:** a user moves only within the same wireless access network, or carries a device between networks but turns it off while traveling. Example: carrying a laptop from home to a café.
  - **Device mobility within the same network:** a user moves between access points in the same wireless LAN (Section 7.3) or between base stations in the same cellular network, staying in the same network. The device keeps its IP address and its connections. Handled at the link layer.
  - **Device mobility between networks, while maintaining ongoing connections:** a user passes through multiple wireless access networks (for example, while driving or on a train) and wants to maintain an uninterrupted TCP connection to a remote application. This is the challenging case and the focus of this section.

### The importance of a device's network address
- The applications that run on the mobile device and on remote hosts identify the device by its **IP address**, and they want connections (TCP) to stay up even as the device moves. If the device's IP address changes, the TCP connection breaks (since a TCP socket is identified by the four-tuple including IP addresses).
- **Option 1: let routing handle it.** When a mobile device moves from one network to another, the new network could advertise to all other networks that the mobile device is now reachable there. Using existing routing protocols, routers would learn about the new location. Problem: this approach **doesn't scale**: routers would have to maintain forwarding table entries for potentially billions of mobile devices, and update them every time any device moves.
- **Option 2: push mobility functionality to the edge.** The approach actually used.

### Home networks and roaming on visited networks
- Each mobile device has a **home network**, the network of its cellular provider (the one it subscribes to). Its **home agent** keeps track of where it is.
- A network the device is currently in, other than its home network, is a **visited network**.
- **Permanent address:** an address in the home network that remains constant.
- **Care-of address (COA):** an address in the visited network.

### Direct and indirect routing to/from a mobile device
How does a correspondent (a remote host sending datagrams to the mobile device) reach a device that has moved?
- **Indirect routing:**
  - The correspondent simply addresses datagrams to the mobile device's **permanent address** and sends them into the network, unaware of whether the device is at home or visiting another network. Mobility is completely **transparent** to the correspondent.
  - The datagrams are first routed, as usual, to the mobile device's **home network**.
  - There, the **home agent** (which keeps track of the device's current location/COA) intercepts the datagrams and **forwards them (tunnels them)** to the mobile device's care-of address in the visited network: it encapsulates each datagram in a new datagram addressed to the COA.
  - The **foreign agent** (or the mobile device itself) in the visited network extracts the original datagram and delivers it.
  - When the mobile device sends datagrams to the correspondent, it can send them directly, or route them back through the home agent.
  - The device must register its location with the home agent when it moves. The mobile device's **IP address stays the same** as it moves between networks, so ongoing TCP connections continue.
  - **Downside: triangle routing.** Datagrams addressed to the mobile device must first go to the home agent and then to the visited network, even when a much more efficient route exists between the correspondent and the mobile device. In the worst case, the correspondent and mobile device are in the same network, yet datagrams travel to the far-away home network and back.
- **Direct routing:**
  - Overcomes the inefficiency of triangle routing, at the cost of additional complexity.
  - The correspondent first learns the mobile device's **COA** (by querying the home network's HSS or home agent), then **tunnels datagrams directly** to the mobile device's COA.
  - Problems: it's **not transparent** to the correspondent (the correspondent must get the COA from the home agent), and **when the mobile device moves from one visited network to another**, the correspondent needs to be told about the new COA. One solution: the first visited network acts as an **anchor**, and when the device moves to a new network, it registers with the new foreign agent, which tells the anchor foreign agent the new COA; the anchor then forwards datagrams.

## 7.6 Mobility Management in Practice

### Mobility management in 4G/5G networks
Example: a mobile device attaches to a visited 4G network, gets a data path, and moves between base stations.
1. **Mobile device and base station association:** the mobile device associates with a base station in the visited network. It provides its IMSI, which also identifies its home network.
2. **Control-plane configuration of network elements for the mobile device:** the visited network's MME and the home network's HSS establish control-plane state indicating that the mobile device is resident in the visited network. Authentication and authorization are performed.
3. **Data-plane configuration of forwarding tunnels for the mobile device:** the visited network and the home network establish **tunnels** through which the mobile device and the streaming server can send/receive IP datagrams, using indirect routing via the home network's P-GW. (Since the P-GW is in the home network, datagrams from/to the device travel through the home network: like indirect routing in Section 7.5.) The tunnels go from the base station to the S-GW (visited network) and from the S-GW to the P-GW (home network).
4. **Mobile device handover from one base station to another:** the mobile device changes its point of attachment to the visited network, via a **handover** from one base station to another.

**Handover (in detail):**
- A handover occurs when a mobile device changes its association from one base station to another. The mobile device's data plane path is rerouted from the source base station to the target base station.
- Why handovers happen: the signal between the current base station and the mobile device may have deteriorated to the point that communication is impaired, or a cell may be overloaded.
- Steps:
  1. The current (**source**) base station selects the **target** base station and sends a **Handover Request** message to it. (The mobile device periodically measures the strength of beacon signals from nearby base stations and reports these to its current base station, which uses them to decide.)
  2. The target base station checks whether it has the resources to support the mobile device and its quality-of-service requirements. If so, it preallocates channel resources (time slots) on its radio access network and other resources for the device, and replies to the source base station with a **Handover Request Acknowledge** message containing the information the mobile device needs to associate with the new base station.
  3. The source base station receives the acknowledgment and informs the mobile device of the identity of the target base station and the channel access information. At this point, the mobile device can begin associating with the new target base station. The source base station also stops forwarding datagrams to the mobile device and instead **forwards any tunneled datagrams it receives to the target base station**, which will later forward them to the mobile device.
  4. The target base station informs the MME that it (the target base station) will be the new base station serving the mobile device. The MME, in turn, signals to the S-GW and the target base station to **reconfigure the S-GW-to-base-station tunnel** to terminate at the target base station, rather than at the source base station.
  5. The target base station confirms back to the source base station that the tunnel has been reconfigured, allowing the source base station to release the resources associated with that mobile device.
  6. At this point, the mobile device can exchange datagrams through the target base station via the reconfigured tunnel. The handover is complete.

### Mobile IP
- **Mobile IP** is the IETF's standard for mobility in the Internet, developed in the 1990s. It's a flexible standard that uses **indirect routing** with home agents, foreign agents, care-of addresses and encapsulation/decapsulation, similar to the general principles in Section 7.5.
- Three main pieces:
  - **Agent discovery:** mechanisms for a home or foreign agent to advertise its services to mobile devices, and protocols for mobile devices to solicit the services of a foreign or home agent. (Agents advertise using ICMP messages.)
  - **Registration with the home agent:** protocols for the mobile device and/or foreign agent to register and deregister COAs with a mobile device's home agent.
  - **Indirect routing of datagrams:** the standard also defines the manner in which datagrams are forwarded to mobile devices by a home agent, including rules for forwarding datagrams, rules for handling error conditions and several forms of encapsulation.
- Although Mobile IP and its descendants have been well studied, Mobile IP has **seen limited deployment**. 4G/5G cellular networks, with their own mobility management (as above), have been far more widely deployed.

## 7.7 Wireless and Mobility: Impact on Higher-Layer Protocols

- One might think the transport and application layers would be unaffected by wireless and mobility, since the network layer provides the same best-effort service model on wired and wireless networks. Indeed, TCP and UDP can (and do) operate in networks with wireless links. But **performance** can be very different.
- **The problem for TCP:** TCP retransmits a segment that is either lost or corrupted on the path between sender and receiver. With mobile users, loss can come from **network congestion** (router buffer overflow) **or** from **handover** (delays in rerouting segments to a mobile device's new point of attachment), or from **bit errors on the wireless link**. In all cases, TCP's receiver-to-sender ACK indicates only that a segment wasn't received intact; **the sender is unaware of whether the segment was lost due to congestion, during handover or due to detected bit errors**. In all cases, the sender's response is the same: **retransmit the segment and reduce its congestion window**.
  - TCP's congestion control response is **problematic** in a wireless setting: the loss may not be due to congestion at all. Unnecessarily throttling the sender reduces throughput.
- **Three broad classes of approaches** to deal with this:
  - **Local recovery:** recover from bit errors when and where (e.g., at the wireless link) they occur. Example: the **802.11 ARQ protocol** (link-layer retransmissions), or more sophisticated approaches that use both ARQ and **FEC**.
  - **TCP sender awareness of wireless links:** in local recovery approaches, the TCP sender is blissfully unaware that its segments are traversing a wireless link. An alternative approach is for the TCP sender and receiver to be **aware of the existence of a wireless link**, to distinguish between congestive losses occurring in the wired network and corruption/loss occurring at the wireless link, and to invoke congestion control only in response to congestive wired-network losses.
  - **Split-connection approaches:** the end-to-end connection between the mobile user and the other end point is **broken into two transport-layer connections**: one from the mobile host to the wireless access point, and one from the wireless access point to the other communication end point. The end-to-end connection is thus formed by the concatenation of a wireless part and a wired part. The transport layer over the wireless segment can be a standard TCP connection, or a specially tailored error-recovery protocol on top of UDP. This approach is widely used in cellular data networks, and significant performance improvements have been reported.
- **Application layer:** an application that operates over a wireless link, particularly over a cellular link, must treat bandwidth as a **scarce commodity**. For example, a web server serving content to a web browser on a 4G phone will likely not be able to provide the same image-rich content it gives to a browser operating over a wired connection. Wireless links also often have higher and more variable delays. Applications like **DASH** adapt to the changing available bandwidth. And with location-aware mobile devices, many location-based applications (like maps and ride-sharing) have emerged.

## Key terms
- **Wireless host, base station, access point (AP), cell tower.**
- **Infrastructure mode vs. ad hoc network; MANET, VANET.**
- **Handoff / handover:** changing from one base station to another.
- **Path loss, interference, multipath propagation:** why wireless links are error-prone.
- **SNR, BER:** signal-to-noise ratio and bit error rate.
- **Hidden terminal problem, fading.**
- **CDMA:** each sender uses a unique, orthogonal code; receivers decode with the inner product.
- **802.11 (WiFi), BSS, SSID, channels 1/6/11, beacon frames, passive/active scanning, association.**
- **CSMA/CA:** WiFi's MAC protocol; DIFS, SIFS, random backoff, link-layer ACKs.
- **RTS/CTS:** optional channel reservation to deal with hidden terminals.
- **802.11 frame address fields:** receiver, transmitter and router interface (plus a fourth for ad hoc).
- **Rate adaptation, power management (sleep/wake with beacons).**
- **Bluetooth:** piconet, controller and clients, frequency-hopping spread spectrum.
- **4G LTE elements:** UE, eNode-B, HSS, MME, S-GW, P-GW; IMSI on a SIM card.
- **OFDM:** LTE's radio access scheme.
- **GTP tunnels.**
- **5G: eMBB, URLLC, mMTC, millimeter wave, small cells, beamforming, gNB, network slicing.**
- **Home network, visited network, permanent address, care-of address (COA).**
- **Home agent, foreign agent.**
- **Indirect routing (triangle routing) vs. direct routing.**
- **Mobile IP:** agent discovery, registration, indirect routing.
- **Local recovery, TCP sender awareness, split-connection approaches:** dealing with TCP over wireless.

## Quick review
- List how wireless links differ from wired links, and explain SNR vs. BER.
- Explain the hidden terminal problem and how RTS/CTS helps.
- Walk through CSMA/CA step by step and explain why WiFi uses collision avoidance instead of collision detection.
- Explain what the three address fields in an 802.11 frame hold, and why the third is needed.
- Name the 4G LTE network elements and what each does; know what's data plane vs. control plane.
- Compare indirect and direct routing to a mobile device.
- Walk through the steps of a cellular handover.
- Explain why TCP performs poorly over wireless links and the three ways to fix it.
