# Chapter 5: The Network Layer: Control Plane

Chapter 4 covered how a router forwards a packet using its forwarding table (the data plane). This chapter covers the **control plane**: the network-wide logic that decides which paths packets take, and so what goes in those forwarding tables. It covers the two classic routing algorithms (link-state and distance-vector), how they're used in the Internet inside networks (OSPF) and between networks (BGP), how SDN controllers do the same job in software, the ICMP protocol used for error reporting, and how networks are managed (SNMP, NETCONF/YANG).

## 5.1 Introduction

Two approaches to computing and distributing forwarding tables:
- **Per-router control:** a routing algorithm runs in **each and every router**. Each router has a routing component that talks to the routing components in other routers to compute its own forwarding table. This is how the Internet has worked for decades (**OSPF** and **BGP** work this way).
- **Logically centralized control:** a **logically centralized controller** computes and distributes forwarding tables to all routers. Each router has a **control agent (CA)** that talks with the controller and does what it says. CAs don't talk directly to each other or take part in computing the tables. This is the **SDN** approach. "Logically centralized" means the controller is a single service from the outside, even though it may be built from many servers for reliability and scale.

## 5.2 Routing Algorithms

### The goal
Find a **"good" path (route)** from a sender to a receiver through the network of routers. Usually "good" means **least cost**, but real-world policy also matters (for example, a router owned by company X shouldn't carry traffic from company Y).

### Graph model
- A network is modeled as a **graph G = (N, E)**: N is the set of **nodes** (routers) and E is the set of **edges** (links).
- Each edge has a **cost c(x, y)** that can reflect physical length, link speed, monetary cost, delay, etc. If there's no edge between x and y, the cost is infinity.
- The cost of a path is the sum of its edge costs. The **least-cost path** is the one with the smallest total cost. If all edges have cost 1, it's the **shortest path** (fewest hops).

### Ways to classify routing algorithms
- **Centralized vs. decentralized:**
  - A **centralized routing algorithm** computes the least-cost path using **complete, global knowledge** of the network: every node knows the full topology and all link costs. These are called **link-state (LS) algorithms**.
  - A **decentralized routing algorithm** computes paths **iteratively and in a distributed way**. No node has complete information; each starts with the costs of its own directly attached links and exchanges information with neighbors. Example: **distance-vector (DV)**.
- **Static vs. dynamic:** static routes change very slowly (often by hand); dynamic algorithms change routes as traffic loads or topology change.
- **Load-sensitive vs. load-insensitive:** in load-sensitive algorithms, link costs change with congestion. Today's Internet routing algorithms (OSPF, BGP, RIP) are **load-insensitive**: a link's cost doesn't directly reflect its current congestion.

### The link-state (LS) routing algorithm: Dijkstra's algorithm
- Every node gets the full topology and all link costs by having each node broadcast **link-state packets** to all other nodes (**link-state broadcast**). After that, every node has the same complete view and runs the algorithm itself.
- **Dijkstra's algorithm** computes the least-cost path from one node (the source u) to **all** other nodes. It's **iterative**: after the k-th iteration, the least-cost paths to k destinations are known, and those are the k cheapest.
- Notation:
  - **D(v):** cost of the least-cost path from the source to v found so far.
  - **p(v):** the previous node (the neighbor of v) along that path.
  - **N':** the set of nodes whose least-cost path is definitively known.
- **Steps:**
  1. **Initialization:** N' = {u}. For every node v, if v is a neighbor of u, D(v) = c(u, v); otherwise D(v) = ∞.
  2. **Loop until all nodes are in N':**
     - find the node w **not in N'** with the **minimum D(w)**, and add w to N';
     - for each neighbor v of w not in N', update: **D(v) = min( D(v), D(w) + c(w, v) )**. The new cost to v is either the old cost or the cost to w plus the cost from w to v.
- After it finishes, you can trace the predecessor nodes back from each destination to build the **least-cost path tree**, and the **forwarding table** (the first hop toward each destination).
- **Complexity:** with n nodes (not counting the source), the total number of nodes searched over all iterations is n(n+1)/2, so it's **O(n²)** in the worst case. A heap data structure can make it faster.
- **Oscillation problem:** if link costs depend on the traffic load (load-sensitive), LS routing can **oscillate**. All routers move traffic to the currently least-loaded path, which then becomes the most-loaded, and they all switch back. Fixes: don't use load-sensitive costs, or make sure routers don't all run the algorithm at the same time (randomize when each router sends its link advertisements).

### The distance-vector (DV) routing algorithm
DV is **iterative**, **asynchronous** and **distributed**:
- **Distributed:** each node gets information from one or more **directly attached neighbors**, does a calculation and sends results back to its neighbors.
- **Iterative:** the process continues until no more information is exchanged between neighbors.
- **Asynchronous:** nodes don't need to operate in lockstep.

**The Bellman-Ford equation** is at the heart of DV. Let d_x(y) be the cost of the least-cost path from x to y. Then:

**d_x(y) = min over all neighbors v of x { c(x, v) + d_v(y) }**

In words: to get from x to y, first go to some neighbor v, then take v's least-cost path to y. The best option is the minimum over all neighbors. The neighbor v* that gives the minimum is the **next hop** in x's forwarding table toward y.

**How it works:**
- Each node x keeps:
  - the cost **c(x, v)** to each directly attached neighbor;
  - its own **distance vector D_x = [D_x(y) for all y]**: its estimates of the cost to every destination;
  - the **distance vectors of each of its neighbors**.
- From time to time, each node **sends a copy of its distance vector to each neighbor**.
- When x receives a new distance vector from a neighbor, it saves it and **updates its own** vector with Bellman-Ford: **D_x(y) = min_v { c(x, v) + D_v(y) }** for every destination y.
- If x's distance vector **changes**, x sends the new vector to its neighbors.
- Eventually each estimate D_x(y) **converges** to the actual least-cost d_x(y).
- Each node only ever talks to its neighbors, and only when something changes: "wait for a change in a local link cost or a message from a neighbor; recompute; if the estimate changed, notify neighbors."

**Link-cost changes and the count-to-infinity problem:**
- **Good news travels fast:** when a link cost **decreases**, the update spreads quickly; the network converges in a few iterations.
- **Bad news travels slow:** when a link cost **increases** a lot (or a link fails), a **routing loop** can form. Example: y uses z to reach x, while z thinks it can reach x through y, so packets bounce between them. Each exchange increases the estimates only a little at a time, so it can take many iterations to converge (with very large costs, effectively forever). This is the **count-to-infinity problem**.
- **Poisoned reverse:** a partial fix. If z routes through y to reach destination x, z tells y that its distance to x is **infinity** (even though it isn't), so y won't try to route to x through z. This prevents loops between two neighbors, but **not** loops involving three or more nodes.

### Comparison of LS and DV
- **Message complexity:** LS needs each node to know every link's cost, so O(|N||E|) messages must be sent, and any link-cost change must go to all nodes. DV exchanges messages only between neighbors, and only when changes affect least-cost paths.
- **Speed of convergence:** LS is an O(|N|²) algorithm; DV can converge slowly, can have routing loops while converging, and suffers from count-to-infinity.
- **Robustness (what happens when a router fails or misbehaves?):**
  - **LS:** a router could broadcast a wrong cost for one of its attached links, but each node computes **its own** forwarding table, which provides some robustness.
  - **DV:** a node can advertise wrong least-cost paths to **any or all** destinations, and errors **spread** through the whole network, since each node's calculation is passed on to its neighbors. (Real-world example: a misconfigured router in 1997 told its neighbors it had zero-cost paths to every destination, attracting huge amounts of traffic.)
- Neither is clearly better; both are used in the Internet.

## 5.3 Intra-AS Routing in the Internet: OSPF

### Why we need autonomous systems
Treating all routers as one flat network doesn't work in practice:
- **Scale:** with hundreds of millions of routers, storing and exchanging routing information about every one would overwhelm routers. DV would never converge, and LS broadcasts would use up all the bandwidth.
- **Administrative autonomy:** the Internet is a network of ISPs, each of which wants to run its own network as it likes (choosing its own routing algorithm) and hide its internal organization from others.

Solution: organize routers into **autonomous systems (ASs)**, each a group of routers under the same administrative control. Often an ISP's network is one AS; some ISPs split their network into several ASs. Each AS is identified by a globally unique **AS number (ASN)**, assigned by ICANN's regional registries.
- Routers in the same AS all run the same routing algorithm: an **intra-autonomous system routing protocol** (an **interior gateway protocol**).

### OSPF (Open Shortest Path First)
OSPF and its close relative IS-IS are widely used for intra-AS routing in the Internet.
- **"Open"**: the routing protocol specification is publicly available (unlike, e.g., Cisco's proprietary EIGRP).
- **A link-state protocol:** it uses **flooding** of link-state information and **Dijkstra's least-cost path algorithm**. Each router builds a complete topological map (a graph) of the whole AS, then runs Dijkstra locally to find the shortest-path tree to all **subnets**, with itself as the root.
- **Link costs are set by the network administrator.** Setting all weights to 1 gives minimum-hop routing; setting each link's weight **inversely proportional to its capacity** discourages traffic from using low-bandwidth links. OSPF doesn't dictate how weights are set; it just finds the least-cost paths given them.
- A router **broadcasts link-state information to all other routers in the AS** (not just its neighbors) whenever a link's state changes (like a cost change or an up/down status change), and also **periodically (at least every 30 minutes)**, even if nothing changed, for robustness.
- OSPF advertisements are carried directly in IP datagrams (protocol number **89**), so OSPF must handle reliable message transfer and link-state broadcast itself. It checks that links are working with **HELLO** messages sent to attached neighbors.

**Advanced features of OSPF:**
- **Security:** exchanges between routers can be **authenticated** (simple, using a plaintext password, or MD5, using a shared secret key and a hash), so only trusted routers take part. This prevents malicious intruders from injecting false routing information.
- **Multiple same-cost paths:** when several paths to a destination have the same cost, OSPF lets them all be used (no need to pick one), which spreads the load.
- **Integrated support for unicast and multicast routing.**
- **Support for hierarchy within a single AS:** an AS can be divided into **areas**. Each area runs its own OSPF link-state algorithm, and routers broadcast link state only within their area. **Area border routers** route packets between areas. One area is configured as the **backbone area**, which connects all the other areas and always contains all the area border routers. Inter-area routing goes from a source to an area border router, through the backbone, to the destination area's border router, then to the destination.

## 5.4 Routing Among the ISPs: BGP

When the source and destination are in **different ASs**, an **inter-autonomous system routing protocol** is needed. All ASs in the Internet run the same one: **BGP (Border Gateway Protocol)**, specifically BGP4. BGP is arguably the **most important protocol in the Internet**, the "glue" that holds the thousands of ISPs together. It's a **decentralized and asynchronous** protocol in the spirit of distance-vector routing.

### The role of BGP
- In BGP, packets aren't routed to a specific destination address; they're routed to **CIDR prefixes**, each representing a subnet or a collection of subnets (like `138.16.68/22`). A router's forwarding table has entries of the form (x, I), where x is a prefix and I is one of the router's interfaces.
- BGP gives each router a way to:
  1. **Get prefix reachability information from neighboring ASs:** BGP lets each subnet advertise its existence to the rest of the Internet. "I exist and I am here." Without BGP, each subnet would be an isolated island.
  2. **Determine the "best" routes to the prefixes:** a router may learn several routes to a given prefix; to choose the best, it runs the **BGP route-selection procedure** locally, using the available route information and **policy**.

### Advertising BGP route information
- Each router is either a **gateway router** (on the edge of its AS, directly connected to routers in other ASs) or an **internal router** (connected only to hosts and routers inside its own AS).
- Routers exchange routing information over semi-permanent **TCP connections on port 179**, called **BGP connections** (the pair of routers are **BGP peers**).
- **eBGP (external BGP):** a BGP connection between routers in **two different ASs**.
- **iBGP (internal BGP):** a BGP connection between routers **in the same AS**. There's typically an iBGP connection between each pair of routers within an AS (a full mesh).
- Example of propagation: AS3 has a prefix x. Its gateway router 3a sends an eBGP message "AS3 x" to gateway 2c in AS2. Router 2c uses iBGP to tell all the other routers in AS2, including gateway 2a. Router 2a then sends "AS2 AS3 x" over eBGP to AS1's gateway 1c, which tells all of AS1's routers over iBGP. Now every router in AS1 and AS2 knows how to reach x.

### Determining the best routes
- A route advertisement includes a prefix plus **BGP attributes**. A **route** = prefix + attributes. Two of the most important attributes:
  - **AS-PATH:** the list of ASs the advertisement has passed through. When a prefix is passed into an AS, the AS adds its own ASN to the front of the list (e.g., "AS2 AS3"). It's also used to **detect and prevent loops**: if a router sees its own AS in the path, it rejects the advertisement.
  - **NEXT-HOP:** the IP address of the router interface that **begins the AS-PATH** (the gateway router in the neighboring AS).
- Routers use **import policies** to decide whether to accept or filter a route (for example, an AS may not want to send traffic through certain other ASs).

**Hot-potato routing:**
- Among all possible gateways, a router chooses the one with the **least cost to the gateway** itself (using intra-AS routing costs).
- The idea: get packets **out of your own AS as quickly (cheaply) as possible**, without worrying about the cost of the rest of the path outside your AS. It's a **selfish** algorithm: it reduces cost within your own AS while ignoring the rest of the end-to-end cost.
- Steps: learn from iBGP that the prefix is reachable via several gateways → use intra-AS routing (e.g., OSPF) to find the least-cost path to each gateway → choose the gateway with the smallest cost → add (prefix, interface toward that gateway) to the forwarding table.

**The full route-selection algorithm** (applied in order, until one route remains):
1. **Local preference:** each route has a local preference value set by the AS's policy (assigned by the router or learned from another router in the same AS). Routes with the **highest local preference** are chosen. This is how **policy** comes first.
2. **Shortest AS-PATH:** among the remaining routes with the same highest local preference, choose the one with the shortest AS-PATH (a distance-vector-like rule, where the distance is the number of AS hops).
3. **Closest NEXT-HOP router: hot-potato routing.** Among the remaining routes, choose the one with the closest next-hop router (lowest intra-AS cost).
4. **BGP identifiers:** if still tied, use the BGP identifiers to break the tie.

### IP anycast
- BGP is also used to implement **IP-anycast**, commonly used in DNS.
- Motivation: many servers in different geographic places (for example, CDN servers or DNS root servers) each hold copies of the same content, and you want each user to reach the "closest" one.
- How: the CDN (or DNS operator) assigns **the same IP address** to many of its servers and uses BGP to advertise that address from each server's location. When a BGP router gets several advertisements for the address, it treats them as different paths to the same place, and normal route selection picks the "best" (closest) one. Users are automatically routed to the nearest server.
- Many of the **13 DNS root server** addresses are served by hundreds of anycast instances worldwide this way. CDNs generally don't use anycast for video, because BGP routing changes could switch a TCP connection to a different server partway through; DNS queries are short UDP exchanges, so anycast suits them well.

### Routing policy
- Policy can override everything else (local preference is the first rule).
- **Customer and provider networks:** an access ISP (customer) pays a provider ISP. A **stub network** is one that doesn't carry traffic for others.
- A **multi-homed stub network** (connected to two providers) wants to make sure it never carries traffic between its two providers. It does this by **not advertising** to either provider any path to the other provider's destinations: if X doesn't advertise a route, its providers won't send traffic through it.
- A rule of thumb many ISPs follow: **any traffic flowing across an ISP's backbone network must have either a source or a destination (or both) in a network that is a customer of that ISP.** Otherwise the traffic is getting a free ride on the ISP's network. Provider ISPs therefore choose not to advertise certain routes to peers. Peering agreements between ISPs are typically confidential and negotiated case by case.

### Why are intra-AS and inter-AS routing protocols different?
- **Policy:** between ASs, **policy dominates**: an AS may want to control what traffic it carries and how its traffic is routed. Within an AS, everything is under the same administrative control, so policy is less of an issue.
- **Scale:** inter-AS routing must handle routing among a huge number of networks; within an AS, scale is less important (and an AS can split itself into areas if it grows too big).
- **Performance:** inter-AS routing is policy-oriented, so the quality (performance) of routes is a secondary concern (and a longer or more costly route may be used if it satisfies policy). Within a single AS, routing can focus on performance.

### Putting it together: how an entry gets into a forwarding table
1. A prefix is advertised by a far-away AS over eBGP.
2. It spreads through ASs via eBGP and within ASs via iBGP.
3. Each router applies policy (local preference), AS-PATH length and hot-potato routing to pick the best route.
4. Intra-AS routing (OSPF) gives the path to the chosen gateway.
5. The router puts (prefix, outgoing interface) into its forwarding table.

## 5.5 The SDN Control Plane

### Four key characteristics of SDN architecture
1. **Flow-based forwarding:** packet forwarding can be based on **any number of header fields** at the transport, network or link layer (not just the destination IP address), using flow tables, as in Chapter 4's generalized forwarding (OpenFlow).
2. **Separation of data plane and control plane:** the data plane is a set of relatively simple but fast network switches that do "match plus action." The control plane is a set of **servers and software** that decide and manage the switches' flow tables.
3. **Network control functions outside the data-plane switches:** the control plane is software running on servers that are separate and remote from the switches. It has two parts: an **SDN controller** (or network operating system) and a set of **network-control applications**.
4. **A programmable network:** network-control applications (routing, access control, load balancing, etc.) are programs that use the controller's APIs to define and control the data plane.

SDN represents a significant **"unbundling"** of network functionality: data-plane switches, SDN controllers and network-control apps can come from different vendors and organizations. This is similar to how computing changed from mainframes (where one company supplied the hardware, OS and apps) to PCs (with separate vendors for each).

### The SDN controller's three layers
- **Communication layer (southbound interface):** communicates between the controller and the controlled network devices. Uses a protocol like **OpenFlow** to send flow table commands to switches, and to receive events from them (for example, a link coming up or going down, or a new device joining).
- **Network-wide state-management layer:** the control decisions (like configuring flow tables or setting up load balancing) need up-to-date information about the state of the network's hosts, links, switches and other devices. The controller keeps a database of the network state, including flow tables and statistics.
- **Interface to the network-control application layer (northbound interface):** an API that lets network-control applications read and write network state and flow tables. Apps can also register to be notified of state-change events.

The controller is **logically centralized but typically implemented on several servers**, for fault tolerance, high availability and performance. Well-known controller platforms: **OpenDaylight (ODL)** and **ONOS**.

### OpenFlow protocol
OpenFlow runs between the controller and a controlled switch over **TCP (default port 6653)**.

**Messages from the controller to a switch:**
- **Configuration:** query and set a switch's configuration parameters.
- **Modify-State:** add, delete or modify entries in the switch's flow table, and set switch port properties.
- **Read-State:** collect statistics and counter values from the switch's flow table and ports.
- **Send-Packet:** send a specific packet out of a specified port of the controlled switch.

**Messages from a switch to the controller:**
- **Flow-Removed:** tells the controller a flow table entry has been removed (for example, after a timeout).
- **Port-status:** tells the controller about a change in port status.
- **Packet-in:** sends a packet to the controller. A packet that doesn't match any flow table entry (or that matches an entry whose action is to send it to the controller) goes up this way.

### Example: a link-state change
1. Switch s1 sees a link failure between itself and s2, and notifies the controller with an OpenFlow **port-status** message.
2. The controller receives the message and updates its link-status information.
3. The link-state routing application (which runs Dijkstra in the controller, not in the switches) has registered to be notified about link-status changes, and is told about the failure.
4. The routing app gets the network graph and link states from the controller's database and computes new least-cost paths.
5. The app tells the flow-table computation component which tables need to change.
6. The controller uses OpenFlow to update the flow tables at the affected switches (s1, s2, s4, etc.).

### SDN: past and future
- SDN ideas go back to earlier efforts (like the 4D project and Ethane), but took off with **OpenFlow** around 2008.
- SDN is now widely used in **data centers** and in large private wide-area networks. **Google's B4** network, which connects its data centers, was an early major SDN deployment, using a centralized traffic-engineering controller to push its links to nearly 100% utilization.
- SDN ideas also show up in **network function virtualization** and in cellular network design.

## 5.6 ICMP: The Internet Control Message Protocol

- **ICMP** is used by hosts and routers to communicate **network-layer information** to each other. Its most typical use is **error reporting** (for example, "destination network unreachable").
- ICMP is often considered part of IP, but architecturally it sits **just above IP**: ICMP messages are carried **inside IP datagrams** (protocol number 1).
- An ICMP message has a **type** field and a **code** field, and contains the header and the first 8 bytes of the IP datagram that caused it, so the sender can tell which packet caused the error.
- **Important message types:**
  - **Type 0, code 0:** echo reply (to ping).
  - **Type 3:** **destination unreachable**: code 0 network unreachable, code 1 host unreachable, code 3 **port unreachable**, etc.
  - **Type 4, code 0:** source quench (congestion control; rarely used now).
  - **Type 8, code 0:** **echo request** (ping).
  - **Type 11, code 0:** **TTL expired**.
  - **Type 12, code 0:** IP header bad.
- **Ping** sends an ICMP type 8 code 0 (echo request) to the target host. The destination replies with a type 0 code 0 (echo reply).
- **How traceroute works using ICMP:**
  - The source sends a series of ordinary IP datagrams (carrying UDP segments with an **unlikely port number**) to the destination.
  - The first datagram has a **TTL of 1**, the second 2, the third 3, and so on. The source starts a timer for each.
  - When the n-th datagram reaches the n-th router, its TTL has just expired, so the router discards it and sends back an ICMP **TTL expired** warning (type 11, code 0), which includes the router's name and IP address. The source measures the round-trip time.
  - When a datagram finally reaches the **destination host**, the host replies with an ICMP **port unreachable** message (type 3, code 3), because of the unlikely port number. That tells the source to stop.
- **ICMPv6** was defined for IPv6. It reorganizes the existing types and codes and adds new ones, such as **"Packet Too Big"** (since IPv6 routers don't fragment) and messages for neighbor discovery.

## 5.7 Network Management and SNMP, NETCONF/YANG

### What is network management?
"Network management includes the deployment, integration and coordination of the hardware, software and human elements to monitor, test, poll, configure, analyze, evaluate and control the network and element resources to meet real-time, operational performance and Quality of Service requirements at a reasonable cost." In short: network operators keeping the network running, finding and fixing problems, and configuring devices.

### The key components
- **Managing server:** an application, typically with network managers (humans) in the loop, running in a central **network operations center (NOC)**. It controls the collection, processing, analysis and display of management information, and starts actions to control network behavior.
- **Managed device:** a piece of network equipment (host, router, switch, middlebox, modem, sensor) with configurable hardware and software parts.
- **Data:** each managed device has data, also called **state**, that can be managed:
  - **configuration data:** information explicitly set by the manager (like a device's IP addresses or interface speeds);
  - **operational data:** information the device acquires as it operates (like its list of neighbors in OSPF);
  - **device statistics:** status indicators and counts that are updated as the device runs (like the number of dropped packets).
- **Network management agent:** a software process running in the managed device that communicates with the managing server, taking local actions under its command.
- **Network management protocol:** runs between the managing server and the managed devices, letting the server query a device's status and take actions through its agent.

### Three common ways operators manage networks
- **CLI (command line interface):** an operator types commands directly to a device (for example, over SSH). Error-prone and hard to automate at scale.
- **SNMP/MIB:** the operator queries or sets data in a device's **MIB (Management Information Base)** objects using **SNMP**. Mostly used for querying operational state and statistics; still rarely used for configuring devices.
- **NETCONF/YANG:** a more abstract, network-wide, holistic approach, with a strong emphasis on **configuration management**: specifying correctness constraints and supporting atomic updates across multiple devices.

### SNMP and the MIB
- **SNMPv3 (Simple Network Management Protocol version 3)** is an application-layer protocol that carries management control and information messages between a managing server and an agent. It usually runs over **UDP**.
- The most common use is **request-response mode**: the managing server sends a request to an agent, which performs the action and replies (typically to query or modify MIB values).
- The other common use is for an agent to send an unsolicited message, a **trap message**, to the managing server, to report an exceptional event (like a link going down) that changes the MIB values.
- **Key message types (PDUs):**
  - **GetRequest, GetNextRequest, GetBulkRequest** (manager to agent): get the value of one or more MIB objects (GetBulk gets a large block of data, like a big table).
  - **SetRequest** (manager to agent): set the value of one or more MIB objects.
  - **Response** (agent to manager): generated in response to the requests above.
  - **SNMPv2-Trap** (agent to manager): informs the manager of an exceptional event.
  - **InformRequest** (manager to manager).
- SNMPv3 adds **security** (encryption, authentication, protection against replay) and access control, which earlier versions lacked.
- **MIB:** the operational state data (and some configuration data) in a managed device is represented as **objects** gathered into a MIB. A MIB object might be a counter (like the number of IP datagrams discarded because of header errors), descriptive information (like the version of software running on a DNS server), status (like whether a device is working), or protocol-specific information (like a routing path). Objects are defined in a data description language called **SMI (Structure of Management Information)** and grouped into **MIB modules**; over 400 MIB modules exist. Each object has a globally unique identifier.

### NETCONF and YANG
- **NETCONF** operates between the managing server and the managed devices and provides messaging to (i) **retrieve, set and modify configuration data** at managed devices; (ii) **query operational data and statistics**; and (iii) **subscribe to notifications** generated by devices.
  - It runs over a secure, connection-oriented session like **TLS over TCP**.
  - Messages are encoded in **XML** and use **remote procedure calls (RPCs)**.
  - A session starts with a `<hello>` exchange (to agree on capabilities), followed by RPC messages; the session ends with `<close-session>`.
  - Important operations: **`<get-config>`** (retrieve all or part of a configuration), **`<get>`** (retrieve configuration and operational state data), **`<edit-config>`** (change a configuration), **`<lock>`/`<unlock>`** (lock a device's whole configuration so no other session can change it while you're working), **`<create-subscription>`** and `<notification>` (for event notifications).
  - Big advantage: it can make changes across **multiple devices atomically**: either all the changes succeed or none do, which avoids leaving the network half-configured.
- **YANG** is the **data modeling language** used to specify the structure, syntax and semantics of network management data used by NETCONF, similar to how SMI defines MIBs for SNMP. YANG definitions can be used to generate the XML documents NETCONF sends, and can specify **constraints** a valid configuration must satisfy, helping ensure configurations are correct and consistent.

## Key terms
- **Per-router vs. logically centralized control:** routing computed in each router vs. by an SDN controller.
- **Graph model:** nodes (routers), edges (links), costs c(x, y).
- **Least-cost path:** the path with the smallest total edge cost.
- **Link-state (LS) / Dijkstra:** global knowledge; computes least-cost paths to all nodes; O(n²).
- **Distance-vector (DV) / Bellman-Ford:** d_x(y) = min_v{c(x, v) + d_v(y)}; distributed and iterative.
- **Count-to-infinity:** slow convergence of DV after a cost increase; partly fixed by **poisoned reverse**.
- **Autonomous system (AS):** a group of routers under one administrative control, with an ASN.
- **Intra-AS routing (OSPF):** link-state routing within an AS; areas and a backbone.
- **Inter-AS routing (BGP):** routing between ASs; eBGP and iBGP sessions over TCP port 179.
- **AS-PATH, NEXT-HOP:** important BGP attributes.
- **Hot-potato routing:** send packets to the closest gateway, to get them out of your AS cheaply.
- **Local preference:** BGP's first route-selection rule, set by policy.
- **IP anycast:** advertising the same IP address from many places so users reach the nearest one.
- **SDN controller, southbound/northbound interfaces:** the brains of SDN and its APIs.
- **OpenFlow messages:** Modify-State, Read-State, Packet-in, Port-status, etc.
- **ICMP:** error reporting and diagnostics (ping, traceroute); carried in IP datagrams.
- **SNMP, MIB:** querying and setting device management data.
- **NETCONF, YANG:** configuration management protocol and its data modeling language.

## Quick review
- Run Dijkstra's algorithm by hand on a small graph and build the forwarding table.
- Apply the Bellman-Ford update, and explain count-to-infinity and poisoned reverse.
- Compare LS and DV on messages, convergence speed and robustness.
- Explain why the Internet uses separate intra-AS (OSPF) and inter-AS (BGP) routing.
- List BGP's route-selection steps in order: local preference, AS-PATH, hot potato, tie-break.
- Trace how traceroute uses TTL and ICMP messages.
- Describe what an SDN controller does when a link fails.
