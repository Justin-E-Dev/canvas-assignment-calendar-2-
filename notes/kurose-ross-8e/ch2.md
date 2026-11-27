# Chapter 2: Application Layer

This chapter starts at the top of the protocol stack, with the applications people actually use, and the protocols that make them work. It covers how network apps are structured, then looks closely at the Web (HTTP), email (SMTP, IMAP), the Internet's naming system (DNS), peer-to-peer file sharing (BitTorrent), video streaming and content distribution networks, and finally how to write your own network programs with sockets. The book calls this a "top-down approach" because it starts here and works down.

## 2.1 Principles of Network Applications

When you write a network app, you write programs that run on **end systems** and talk to each other over the network. You do **not** write software for routers or switches. Those devices don't run application-layer code. Keeping apps at the edge lets new applications be developed and deployed quickly.

### Network application architectures
- **Client-server architecture:**
  - An always-on host called the **server** answers requests from many **client** hosts.
  - Clients don't talk directly to each other.
  - The server has a fixed, well-known IP address, so clients can always reach it.
  - Popular services use **data centers** with huge numbers of servers to keep up with demand.
  - Examples: the Web, email, file transfer.
- **Peer-to-peer (P2P) architecture:**
  - Little or no reliance on dedicated servers; intermittently connected hosts called **peers** talk directly to each other.
  - Big advantage: **self-scalability**. Each new peer adds demand, but also adds service capacity by uploading to others.
  - Cost-effective (no big server infrastructure), but harder to manage, secure and make perform well, since peers come and go.
  - Example: BitTorrent.

### Processes communicating
- It's really **processes** (running programs) that communicate, not hosts. Processes on different hosts exchange **messages** over the network.
- In each pair of communicating processes, the one that initiates the communication is the **client**, and the one that waits to be contacted is the **server**. (In P2P, a peer can be both.)
- **Socket:** the interface between a process and the network, the "door" a process sends messages out of and receives them through. It's also the API between the application and the transport layer. The app developer controls everything on the application side of the socket, but has little control on the transport side, apart from choosing the transport protocol and maybe a few parameters.
- **Addressing processes:** to send to a process on another host you need:
  - the host's **IP address** (a 32-bit number in IPv4), and
  - a **port number** that identifies the receiving process on that host. Well-known examples: web server **port 80** (HTTPS uses 443), mail server (SMTP) **port 25**.

### What transport services can an app need?
Four dimensions:
- **Reliable data transfer:** guaranteeing data arrives completely and correctly. Essential for file transfer, email, web pages and financial apps. **Loss-tolerant** apps (like audio/video) can accept some loss.
- **Throughput:** some apps need a guaranteed minimum rate (**bandwidth-sensitive**, like some video/voice); others, called **elastic** apps (email, file transfer, web), use whatever rate is available.
- **Timing:** some apps need low delay, like interactive games or video calls (for example, under a few hundred milliseconds).
- **Security:** encryption, data integrity and end-point authentication.

### Transport services provided by the Internet
The Internet gives apps two transport protocols:
- **TCP:**
  - **Connection-oriented:** a handshake sets up a connection before data flows; the connection is full-duplex.
  - **Reliable data transfer:** delivers all data, without error, in the right order.
  - **Congestion control:** slows the sender when the network is congested (good for the network, even though it may hurt one app).
  - Does **not** guarantee timing or a minimum throughput.
- **UDP:**
  - Lightweight and minimal: **connectionless**, no handshake.
  - **Unreliable**: messages may be lost or arrive out of order.
  - No congestion control: the app can send as fast as it likes.
- **Security with TLS:** neither TCP nor UDP encrypts data. **TLS (Transport Layer Security)** is an enhancement built on top of TCP, implemented in the application, that adds encryption, integrity and end-point authentication. Apps use a TLS socket library.
- Neither TCP nor UDP guarantees throughput or timing, but well-designed apps still work well most of the time.

Typical choices: email (SMTP), remote login, Web (HTTP) and file transfer use **TCP**; streaming media has traditionally used TCP (HTTP-based streaming) too; internet telephony and games often use **UDP** (or either).

### Application-layer protocols
An application-layer protocol defines:
- the **types of messages** exchanged (request, response),
- the **syntax** of each message type (fields and how they're separated),
- the **semantics** of the fields (what they mean),
- the **rules** for when and how processes send and respond to messages.

Some protocols are public, defined in RFCs (like HTTP), so anyone can build compatible software. Others are proprietary (like many video-call or game protocols). Note: a protocol is just one part of an application. The Web app includes HTML documents, browsers and servers, *and* the HTTP protocol.

## 2.2 The Web and HTTP

### Overview
- A **web page** is made of **objects**: files such as an HTML file, JPEG images, JavaScript, CSS or video clips, each addressable by a single **URL**.
- Most pages have a **base HTML file** that references the other objects by URL.
- A URL has two parts: the **host name** of the server and the object's **path name**. Example: in `www.someSchool.edu/someDept/picture.gif`, the host is `www.someSchool.edu` and the path is `/someDept/picture.gif`.
- **HTTP (HyperText Transfer Protocol)** defines how clients (browsers) request pages and how servers send them. It uses **TCP**, so the client first opens a TCP connection to the server (port 80), then sends requests and receives responses through its socket.
- HTTP is **stateless**: the server keeps no information about past client requests. If you ask for the same object twice in a row, the server sends it twice.

### Non-persistent vs. persistent connections
- **Non-persistent HTTP:** each request/response pair uses its **own TCP connection**. For a page with a base file and 10 images, that's 11 TCP connections.
- **Round-trip time (RTT):** the time for a small packet to travel from client to server and back.
- Response time for one object with non-persistent HTTP ≈ **2 RTT + file transmission time**: one RTT to set up the TCP connection (the three-way handshake) and one RTT for the request and the start of the response.
- Downsides: a new connection for every object means overhead for the client and server (buffers and variables for each connection) and 2 RTTs per object. Browsers often open several parallel connections to speed things up.
- **Persistent HTTP:** the server leaves the TCP connection open after responding, and later requests and responses between the same client and server go over the same connection. A whole page, or several pages, can be sent over one connection, and requests can be made back-to-back without waiting for replies (**pipelining**). The **default mode of HTTP/1.1 uses persistent connections.**

### HTTP message format
**Request message:** plain ASCII text.
- **Request line:** method, URL and HTTP version, e.g. `GET /somedir/page.html HTTP/1.1`.
- **Header lines**, e.g. `Host: www.someschool.edu`, `Connection: close` (close the connection after this response), `User-agent:` (the browser type), `Accept-language:`.
- A blank line, then an optional **entity body** (used with POST).
- **Methods:**
  - **GET:** request an object (by far the most common). Form input can also be put in the URL.
  - **POST:** send form data to the server in the body.
  - **HEAD:** like GET, but the server returns only the headers, not the object (useful for debugging).
  - **PUT:** upload an object to a specific path.
  - **DELETE:** delete an object on the server.

**Response message:**
- **Status line:** version, status code and phrase, e.g. `HTTP/1.1 200 OK`.
- **Header lines**, e.g. `Date:`, `Server:`, `Last-Modified:`, `Content-Length:` (bytes in the object), `Content-Type:` (e.g. `text/html`), `Connection: close`.
- The **entity body**: the requested object itself.
- **Common status codes:**
  - **200 OK:** success; the object is in the response.
  - **301 Moved Permanently:** the object moved; the new URL is in the `Location:` header.
  - **400 Bad Request:** the server couldn't understand the request.
  - **404 Not Found:** the document doesn't exist on this server.
  - **505 HTTP Version Not Supported.**

### Cookies: user-server state
Because HTTP is stateless, websites use **cookies** to identify users and keep track of them. Cookies have four parts:
1. a `Set-cookie:` header line in the HTTP response,
2. a `Cookie:` header line in later HTTP requests,
3. a **cookie file** on the user's computer managed by the browser,
4. a **back-end database** at the website.

How it works: the first time you visit a site, the server creates a unique ID, stores it in its database and sends `Set-cookie: 1678`. Your browser saves it, and every later request to that site includes `Cookie: 1678`, so the site can recognize you and track your activity (shopping carts, logins, recommendations). Cookies create a **user session layer on top of stateless HTTP**. They also raise **privacy concerns**, since sites (and third parties) can build detailed profiles of your browsing.

### Web caching (proxy servers)
- A **web cache**, also called a **proxy server**, is a network entity that answers HTTP requests on behalf of the origin server. It has its own storage holding copies of recently requested objects.
- The browser sends requests to the cache. If the cache has the object, it returns it immediately. If not, it fetches the object from the **origin server**, stores a copy and returns it to the browser. The cache is both a client and a server.
- Usually installed by an ISP or a university.
- **Why caches help:**
  - They cut **response time** substantially, especially when the bottleneck between the client and the origin server is much slower than the link to the cache.
  - They reduce traffic on an institution's **access link** to the Internet, which can save money on upgrades.
  - They reduce traffic on the Internet as a whole.
- **Worked example idea:** an institution with a 15 Mbps access link is heavily loaded (traffic intensity near 1, so huge delays). One fix is buying a 100 Mbps link (expensive). The cheaper fix is a cache with, say, a **40% hit rate**: 40% of requests are answered locally almost instantly, the access link's load drops to 60% of what it was, and the average delay ends up even *lower* than with the costly upgrade.
- **CDNs (content distribution networks)** are a large-scale version of the same idea (Section 2.6).

### The conditional GET
Cached copies can go stale. The **conditional GET** lets a cache check whether its copy is still up to date:
- The cache sends a GET with an **`If-modified-since:`** header containing the date its copy was last modified.
- If the object hasn't changed, the server replies **`304 Not Modified`** with an **empty body**, saving bandwidth. If it has changed, the server sends the new version.

### HTTP/2 and HTTP/3
- **HTTP/1.1 problem:** **head-of-line (HOL) blocking**. With one persistent TCP connection, a big object (like a video clip) at the front can hold up all the small objects behind it. Browsers worked around this by opening several parallel TCP connections, which is unfair to other users and wasteful.
- **HTTP/2 (2015):**
  - Lets requests and responses be **multiplexed over a single TCP connection**.
  - Messages are broken into small **frames**, and frames of different responses are **interleaved**, so small objects aren't stuck behind big ones.
  - Supports **response prioritization**: the client can say which responses matter most.
  - **Server push:** the server can send objects the client will need (like images referenced in the HTML) before the client asks for them.
  - Headers are compressed, and the message format is binary.
- **HTTP/3:** runs over **QUIC**, a newer transport protocol built on **UDP** (QUIC adds reliability, congestion control and security in the application layer). It helps further with HOL blocking, because one lost packet no longer stalls all the streams.

## 2.3 Electronic Mail in the Internet

### The three main components
- **User agents:** the programs you read and write email with, like Outlook, Apple Mail or Gmail in a browser.
- **Mail servers:** each user has a **mailbox** on a mail server. The server also has a **message queue** of outgoing messages it's trying to deliver.
- **SMTP (Simple Mail Transfer Protocol):** the main protocol for sending mail between mail servers.

### How a message travels
1. Alice's user agent sends the message to **her mail server**, which places it in its outgoing queue.
2. Alice's mail server opens a **TCP connection to Bob's mail server** (port 25) and transfers the message with SMTP.
3. Bob's mail server puts it in **Bob's mailbox**.
4. Later, Bob's user agent retrieves it from his mail server.

Important: SMTP normally goes **directly** from the sender's server to the recipient's server, with no intermediate mail servers. If Bob's server is down, Alice's server keeps the message in its queue and retries (for example, every 30 minutes), and notifies Alice if it gives up after a few days.

### SMTP details
- Uses **TCP** for reliable transfer.
- Phases: a **handshake** (greeting, sender and recipient identified), **transfer of messages**, then **closure**.
- Client commands include `HELO`, `MAIL FROM`, `RCPT TO`, `DATA` and `QUIT`; the server answers with reply codes and phrases (like `250 OK`). A line with a single period (`.`) ends the message.
- SMTP is a **push** protocol: the sending server pushes the message to the receiving server. (HTTP is mainly a **pull** protocol: users pull information from servers.)
- **Persistent connections:** several messages can be sent over the same TCP connection.
- Legacy limitation: message bodies must be **7-bit ASCII**, so binary data like images has to be encoded into ASCII before sending and decoded after.
- Unlike HTTP, which sends each object in its own response message, SMTP puts all of a message's objects (text, attachments) into one message.

### Mail message format
Header lines come before the body, separated from it by a blank line. Every header must have `From:` and `To:`, and may include `Subject:` and others. (These message headers are different from the SMTP commands like `MAIL FROM`.)

### Mail access protocols
SMTP is used to *send* mail, but the recipient can't use it to *retrieve* mail from their server, because that's a pull operation. Instead:
- Mail goes from Alice's agent to her server with **SMTP or HTTP**, and between servers with **SMTP**.
- Bob retrieves it from his server with either:
  - **HTTP**, using a **web-based email** service or a smartphone app (like Gmail), or
  - **IMAP (Internet Mail Access Protocol)**, defined in RFC 3501, which lets you manage folders and keeps messages on the server, so they stay in sync across devices.

## 2.4 DNS: The Internet's Directory Service

### What DNS does
People prefer **hostnames** (like `www.google.com`), but routers need **IP addresses**. The **Domain Name System (DNS)** translates between them. DNS is:
- a **distributed database** built from a hierarchy of **DNS servers**, and
- an **application-layer protocol** that lets hosts query that database. DNS runs over **UDP on port 53**.

DNS is used by other application protocols like HTTP and SMTP. Before your browser can request a web page, it first does a DNS lookup to get the server's IP address. This adds some delay, but caching usually keeps it small.

### Services DNS provides
- **Hostname to IP address translation** (the main job).
- **Host aliasing:** a complicated **canonical hostname** can have simpler **aliases**; DNS returns the canonical name and its IP address.
- **Mail server aliasing:** lets a company's mail server and web server share a simple alias (like `example.com`).
- **Load distribution:** busy sites run many replicated servers with different IP addresses. DNS returns the whole set of addresses but **rotates their order** in each reply, spreading traffic among the servers.

### Why not one central DNS server?
A single server would be a **single point of failure**, would face enormous **traffic volume**, would be **far away** from most users (slow), and would be very hard to **maintain**. In short, it doesn't scale. So DNS is distributed and hierarchical.

### The DNS hierarchy
- **Root DNS servers:** more than 1,000 server instances worldwide, copies of 13 different root servers, managed by 12 organizations and coordinated through IANA. They provide the addresses of TLD servers.
- **Top-level domain (TLD) servers:** one set for each top-level domain like `.com`, `.org`, `.net`, `.edu`, `.gov` and country domains like `.uk`, `.fr`, `.jp`. They provide the addresses of authoritative servers.
- **Authoritative DNS servers:** every organization with public hosts (web or mail servers) must provide records mapping its hostnames to IP addresses. It can run its own authoritative server or pay a provider to host one.
- **Local DNS server:** not strictly part of the hierarchy, but central to it. Each ISP (residential, university, company) has one, and it's usually close to the host. When a host makes a DNS query, the query goes to the local DNS server, which acts as a **proxy** and forwards it into the hierarchy.

### Iterative vs. recursive queries
- Example: a host at `cse.nyu.edu` wants the IP of `gaia.cs.umass.edu`.
- The host asks its **local DNS server** (a recursive query: "find the answer for me").
- **Iterative** part: the local server asks a **root server**, which replies with the addresses of the `.edu` **TLD servers**; the local server then asks a TLD server, which replies with the **authoritative server** for `umass.edu`; the local server asks that server, which returns the IP address. Each server just says "I don't know, but ask this one."
- In a fully **recursive** query, each server would ask the next one on the requester's behalf. In practice, the query from the host to the local server is recursive and the rest are usually iterative.
- That example takes **8 DNS messages**.

### DNS caching
- When a DNS server gets a reply, it **caches** the mapping in local memory.
- Cached entries expire after a while (commonly two days), set by the record's **TTL**.
- Local DNS servers often cache **TLD server addresses**, so the root servers are skipped for most queries.

### DNS records
DNS servers store **resource records (RRs)**, written as a four-tuple **(Name, Value, Type, TTL)**:
- **Type A:** Name is a hostname, Value is its **IP address**. Example: `(relay1.bar.foo.com, 145.37.93.126, A)`.
- **Type NS:** Name is a domain (like `foo.com`), Value is the hostname of an **authoritative DNS server** for that domain.
- **Type CNAME:** Value is the **canonical hostname** for the alias Name. Example: `(foo.com, relay1.bar.foo.com, CNAME)`.
- **Type MX:** Value is the canonical name of the **mail server** for the alias Name, which lets a company use the same alias for its mail and web servers.

### DNS messages
- Query and reply messages share the **same format**.
- **Header (first 12 bytes):** a 16-bit **identification** number (matches replies to queries) and **flags** (query vs. reply, authoritative answer, recursion desired, recursion available).
- **Question section:** the name being queried and the record type (like A or MX).
- **Answer section:** resource records answering the query (there can be several, for replicated servers).
- **Authority section:** records of other authoritative servers.
- **Additional section:** other helpful records (e.g., the A record for the hostname given in an MX reply).
- You can query DNS directly with tools like `nslookup`.

### Inserting records
To register a new domain (like `networkutopia.com`), you go through a **registrar**, a company accredited by **ICANN** that checks the name is unique and adds it to the DNS database for a fee. You give the registrar the names and IP addresses of your primary and secondary authoritative DNS servers, and the registrar makes sure the matching NS and A records are added to the TLD servers. You also put records for your own web and mail servers (A and MX records) on your authoritative server.

### DNS security
DNS is a critical part of the Internet, so it's a target:
- **DDoS bandwidth-flooding attacks** on root servers. These have mostly failed, because of packet filtering and because local servers cache TLD addresses and rarely need the root.
- **DDoS attacks on TLD servers**, which are potentially more dangerous, since they're harder to bypass with caching.
- **Man-in-the-middle attacks** and **DNS poisoning**: sending fake replies to trick a DNS server into caching bogus records, which can redirect users to an attacker's website.
- **DNSSEC** extends DNS with security features (authenticated records) to prevent this.

## 2.5 Peer-to-Peer File Distribution

### Why P2P scales: the math
Distributing a file of size **F** to **N** peers.
Notation: u_s = server upload rate, u_i = upload rate of peer i, d_i = download rate of peer i, d_min = the slowest download rate.

- **Client-server distribution time:**
  - The server must upload N copies, which takes at least **NF/u_s**.
  - The slowest peer needs at least **F/d_min**.
  - **D_cs = max{ NF/u_s , F/d_min }**
  - For large N, the time grows **linearly** with the number of peers, so it doesn't scale.
- **P2P distribution time:**
  - The server must upload at least one copy: **F/u_s**.
  - The slowest peer must download the file: **F/d_min**.
  - The system as a whole must upload **NF** bits, and the total upload capacity is **u_s + Σu_i**.
  - **D_P2P = max{ F/u_s , F/d_min , NF/(u_s + Σu_i) }**
  - As N grows, the last term grows slowly, because every new peer adds upload capacity. The distribution time stays bounded instead of growing linearly. That's the **self-scaling** property.

### BitTorrent
- **Torrent:** the set of all peers sharing a particular file.
- The file is split into equal-size **chunks** (typically 256 KB). Peers download chunks from each other and upload the chunks they already have.
- **Tracker:** an infrastructure node that keeps track of the peers in the torrent. A new peer registers with the tracker and receives a random list of other peers, then sets up TCP connections with some of them, its **neighbors**.
- **Churn:** peers come and go; a peer that has the complete file can leave (selfishly) or stay as a **seeder** to help others.
- Two key decisions:
  - **Which chunks to request first: rarest first.** Each peer asks its neighbors which chunks they have and requests the chunks that are rarest among its neighbors. This helps make sure rare chunks spread quickly and equalizes chunk copies across the torrent.
  - **Which neighbors to send chunks to: tit-for-tat.** A peer sends to the **four** neighbors currently sending to it at the highest rate (these are **unchoked**), reevaluating every 10 seconds. Every 30 seconds it also **optimistically unchokes** one random neighbor, to give newcomers a chance and possibly find better trading partners.
- The result: peers that upload faster tend to find good partners and get faster downloads, which discourages free-riding.
- **DHT (distributed hash table):** a distributed database spread over peers, used by BitTorrent (and others) to locate peers without a central tracker.

## 2.6 Video Streaming and Content Distribution Networks

### Internet video
- Video is a sequence of images displayed at a constant rate (like 24 or 30 images per second). Each image is an array of pixels.
- Video can be heavily **compressed** by exploiting **spatial redundancy** (within an image, e.g. large areas of the same color) and **temporal redundancy** (between consecutive images that look alike). Compression lets you trade video quality against bit rate.
- Video needs a high **bit rate** (from about 100 kbps for low quality to over 3 Mbps for HD, and much more for 4K). The most important performance measure is **average end-to-end throughput**: the network must deliver at least the video's bit rate for smooth playback.
- Services usually store each video in several versions at different bit rates (different quality levels).

### HTTP streaming and DASH
- **Basic HTTP streaming:** the video is an ordinary file on an HTTP server. The client requests it with a GET and stores incoming bytes in an **application buffer**; once enough is buffered, playback starts, grabbing frames from the buffer while the rest keeps downloading.
- Problem: every client gets the **same encoding** no matter how much bandwidth it has, and a user's bandwidth changes over time.
- **DASH (Dynamic Adaptive Streaming over HTTP):**
  - The video is encoded in several versions at different bit rates and quality levels.
  - Each version is split into **chunks** a few seconds long, each with its own URL.
  - A **manifest file** lists each version's URL and bit rate.
  - The client first requests the manifest, then requests chunks one at a time, **choosing the bit rate for each chunk** based on its measured bandwidth and how full its buffer is. When bandwidth is high it picks high quality; when it drops it switches to a lower bit rate, which avoids freezing.
  - The intelligence is in the **client**: the client decides when to request a chunk, which bit rate to choose and where to get it from.

### Content Distribution Networks (CDNs)
Serving huge amounts of video from one giant data center has problems: it's far from many users (the bottleneck link may be anywhere along the way), popular videos get sent over the same links many times (wasting bandwidth), and it's a single point of failure. So companies use **CDNs**: networks of servers in many places that store copies of videos (and other content) and send each user to a nearby server that gives the best experience.
- A CDN can be **private** (owned by the content provider, like Google's for YouTube) or a **third-party** CDN that serves many content providers (like Akamai or Limelight).
- Two server placement philosophies:
  - **Enter deep:** put server clusters inside access ISPs all over the world (Akamai's approach, thousands of locations). Gets very close to users, so lower delay and higher throughput, but it's hard to manage so many clusters.
  - **Bring home:** build fewer, larger clusters at a smaller number of sites, usually at **IXPs** (Limelight's approach). Easier to manage, with somewhat worse performance for users.
- CDNs often use a **pull** strategy: if a cluster doesn't have a requested video, it fetches it from a central server or another cluster, stores a copy and serves the user. Least-popular videos are deleted when storage is full, much like a web cache.

### How CDNs redirect requests (using DNS)
1. A user clicks a link to a video on a content provider's site (for example, `http://video.netcinema.com/6Y7B23V`).
2. The user's host sends a DNS query for `video.netcinema.com`.
3. The user's local DNS server forwards it to NetCinema's authoritative DNS server, which sees the "video" hostname and, instead of an IP address, returns a hostname **in the CDN's domain** (like `a1105.kingcdn.com`).
4. The local DNS server then queries the CDN's DNS system, which picks a suitable CDN server and returns that server's IP address.
5. The client opens a TCP connection to that CDN server and requests the video with HTTP (with DASH, it gets a manifest first).

### Choosing a cluster
- **Geographically closest:** pick the cluster nearest to the user's local DNS server (located using commercial geolocation databases). Simple, but the closest cluster isn't always the best in network terms, and some users use far-away local DNS servers.
- **Real-time measurements:** clusters periodically measure delay and loss to local DNS servers, to choose based on current network conditions.

### Case studies
- **Netflix:** uses Amazon's cloud for its website, user accounts and encoding videos into many formats, but delivers video through its **own private CDN**. Netflix installs server racks in IXPs and inside residential ISPs (often for free), and **pushes** content to them during off-peak hours instead of pulling on demand. It uses DASH-style adaptive streaming, and since Netflix runs its own CDN it doesn't need DNS redirection; its software tells the client which server to use.
- **YouTube:** Google uses its own private CDN with clusters at IXPs and inside ISPs, and uses a **pull** strategy plus DNS redirection. Most of the time it sends users to the cluster with the lowest RTT, sometimes to more distant ones for load balancing. YouTube uses HTTP streaming, often with the user picking the quality manually.

## 2.7 Socket Programming: Creating Network Applications

A network app is a pair of programs (a client and a server) that communicate through **sockets**. The developer chooses between TCP and UDP. If the app implements an open protocol defined in an RFC, it should use the well-known port number; a proprietary app should avoid well-known port numbers. The book's examples are in **Python**, and both apps do the same simple task:
1. The client reads a line of text from the keyboard and sends it to the server.
2. The server converts it to **uppercase**.
3. The server sends the modified line back.
4. The client displays it.

### Socket programming with UDP
- No connection is set up. The sender must attach the **destination address (IP address and port)** to **every packet** it sends.
- **UDPClient:**
  - `clientSocket = socket(AF_INET, SOCK_DGRAM)` creates a UDP socket. `AF_INET` means IPv4 and `SOCK_DGRAM` means UDP.
  - `clientSocket.sendto(message.encode(), (serverName, serverPort))` sends the message, converted from string to bytes, along with the destination.
  - `modifiedMessage, serverAddress = clientSocket.recvfrom(2048)` waits for the reply (with a 2048-byte buffer).
  - `clientSocket.close()` closes the socket.
- **UDPServer:**
  - Creates a UDP socket the same way, then `serverSocket.bind(('', serverPort))` assigns it the port number (e.g. 12000).
  - Loops forever: `recvfrom` gets the message and the client's address, the server uppercases the text, and `sendto` returns it to that client address.
- The server uses a single socket for all clients, since there's no connection.

### Socket programming with TCP
- TCP is **connection-oriented**: the client and server must first **handshake** and set up a TCP connection.
- The server has a special **welcoming socket** (the "door" every client knocks on first). When a client knocks, the server creates a **new socket dedicated to that client** (the **connection socket**).
- After that, the client and server just write and read bytes; they don't attach addresses to each message, because the connection already links the two sockets. TCP guarantees the bytes arrive, in order.
- **TCPClient:**
  - `clientSocket = socket(AF_INET, SOCK_STREAM)` creates a TCP socket (`SOCK_STREAM` means TCP).
  - `clientSocket.connect((serverName, serverPort))` triggers the three-way handshake and sets up the connection.
  - `clientSocket.send(sentence.encode())` sends data; `clientSocket.recv(1024)` receives the reply; then `close()`.
- **TCPServer:**
  - Creates a TCP socket, binds it to a port, then `serverSocket.listen(1)` makes it listen for connection requests.
  - In a loop, `connectionSocket, addr = serverSocket.accept()` waits for a client and creates the new connection socket. The server reads with `recv`, uppercases the text, sends it back with `send` and closes the **connection socket**, but keeps the welcoming socket open for the next client.

### UDP vs. TCP sockets (summary)
- **UDP:** no connection; every packet needs the destination address; data may be lost or reordered; one server socket handles all clients.
- **TCP:** connection set up first; data flows as a reliable, in-order **byte stream**; the server makes a new socket for each client.

## Key terms
- **Client-server / P2P:** the two main application architectures.
- **Socket:** the interface between an application process and the transport layer.
- **Port number:** identifies a process on a host (HTTP 80, HTTPS 443, SMTP 25, DNS 53).
- **HTTP:** the Web's protocol; stateless; runs over TCP.
- **RTT:** round-trip time.
- **Persistent connection:** one TCP connection reused for multiple HTTP requests.
- **Cookie:** an ID that lets a site track a user across stateless HTTP requests.
- **Web cache / proxy server:** answers requests on behalf of origin servers.
- **Conditional GET:** `If-modified-since` request; `304 Not Modified` if unchanged.
- **HOL blocking:** small objects stuck behind a large one; fixed by HTTP/2 framing.
- **SMTP:** push protocol for sending mail between servers. **IMAP:** protocol for retrieving and managing mail on a server.
- **DNS:** distributed, hierarchical database mapping hostnames to IP addresses.
- **Root, TLD, authoritative, local DNS servers:** the levels of the DNS system.
- **Resource records:** A, NS, CNAME, MX.
- **BitTorrent:** P2P file sharing using chunks, a tracker, rarest first and tit-for-tat.
- **DASH:** adaptive streaming where the client picks a bit rate for each chunk.
- **CDN:** a distributed network of servers that delivers content from near the user.

## Quick review
- Be able to explain why HTTP is stateless and how cookies add state.
- Know response time for non-persistent HTTP: 2 RTT + transmission time per object.
- Walk through a DNS lookup from the local server to root, TLD and authoritative servers.
- Compare client-server and P2P distribution times, and explain why P2P self-scales.
- Describe how DASH and CDNs work together to stream video.
- Know the steps and calls for a UDP vs. a TCP client and server.
