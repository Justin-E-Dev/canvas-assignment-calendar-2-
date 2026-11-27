# Chapter 8: Security in Computer Networks

This chapter covers how to make communication over the Internet secure. It starts by defining what "secure communication" means, then teaches the building blocks of cryptography (symmetric and public key encryption), message integrity (hash functions, MACs, digital signatures and certificates), and end-point authentication. It then shows how these pieces are combined into real protocols at every layer: secure email (PGP), secure TCP connections (TLS), secure IP (IPsec and VPNs), and wireless security (WiFi and 4G/5G). It ends with operational security: firewalls and intrusion detection systems.

## 8.1 What Is Network Security?

The book uses three characters: **Alice** and **Bob** want to communicate securely, and **Trudy** (the intruder) may try to intercept, delete or add messages.

### Desirable properties of secure communication
- **Confidentiality:** only the sender and intended receiver should be able to understand the contents of the transmitted message. Because eavesdroppers may intercept the message, the message must be **encrypted** so that an intercepted message can't be understood by an interceptor.
- **Message integrity:** Alice and Bob want to ensure that the content of their communication is **not altered**, either maliciously or by accident, in transit. Extensions to the checksumming techniques seen in reliable transport and data link protocols can be used.
- **End-point authentication:** both the sender and receiver should be able to **confirm the identity** of the other party involved in the communication: to confirm that the other party is indeed who or what they claim to be.
- **Operational security:** almost all organizations (companies, universities, etc.) have networks attached to the public Internet. These networks can potentially be compromised. Attackers can attempt to deposit worms into the hosts in the network, obtain corporate secrets, map the internal network configurations and launch DoS attacks. Operational devices like **firewalls** and **intrusion detection systems** are used to counter attacks against an organization's network.

### What can Trudy do?
- **Eavesdropping:** sniffing and recording control and data messages on the channel.
- **Modification, insertion or deletion** of messages or message content.
- She can also **impersonate** another party (for example, by spoofing a source address), **hijack** an ongoing connection, and launch **denial of service** attacks.
- Who might Alice and Bob be? Real-life web browsers and servers for electronic transactions (online purchases), online banking clients and servers, DNS servers, routers exchanging routing table updates, and so on.

## 8.2 Principles of Cryptography

### The basic setup
- Alice's message in its original form (for example, "Bob, I love you. Alice") is called **plaintext** or **cleartext**. Alice encrypts it using an **encryption algorithm** so the encrypted message, called **ciphertext**, looks unintelligible to any intruder.
- In many modern cryptographic systems, including those used in the Internet, **the encryption technique itself is known**: published, standardized and available to everyone (even a potential intruder!). Clearly, if everyone knows the method for encoding data, there must be some secret information that prevents an intruder from decrypting the transmitted data. This is where **keys** come in.
- Alice provides a **key, K_A**, a string of numbers or characters, as input to the encryption algorithm, which produces ciphertext **K_A(m)**. Bob provides a key **K_B** to the **decryption algorithm**, which takes the ciphertext and produces the original plaintext: **K_B(K_A(m)) = m**.
- **Symmetric key systems:** Alice's and Bob's keys are **identical** and are **secret**.
- **Public key systems:** a pair of keys is used. One of the keys is known to both Bob and Alice (indeed, it's known to the whole world). The other key is known only by either Bob or Alice (but not both).

### Symmetric key cryptography
**Caesar cipher:** one of the oldest. For English text, each letter in the plaintext is substituted with the letter that is **k letters later** (allowing wraparound; that is, having the letter z followed by the letter a) in the alphabet. For example, if k = 3, the letter "a" becomes "d," "b" becomes "e," and so on. Here the value of k serves as the key. It's easy to break: there are only 25 possible key values.

**Monoalphabetic cipher:** an improvement. It substitutes one letter of the alphabet with another letter, but rather than substituting according to a regular pattern (like substitution with an offset of k for all letters), **any letter can be substituted for any other letter**, as long as each letter has a unique substitute letter (and vice versa). There are 26! (on the order of 10^26) possible pairings, so a brute-force approach would be very difficult. However, **statistical analysis** of the plaintext language can break it easily: for example, knowing that the letters e and t are the most frequently occurring letters in typical English text (13% and 9% of letter occurrences), and that particular two- and three-letter combinations (like "in," "it," "the," "ion," "ing") appear quite often.

**Types of attack, based on what the intruder knows:**
- **Ciphertext-only attack:** the intruder has access only to the intercepted ciphertext, with no certain information about the contents of the plaintext message. Statistical analysis can help.
- **Known-plaintext attack:** the intruder knows some of the (plaintext, ciphertext) pairings. For example, if Trudy knew that "alice" and "bob" appeared in the message, she could determine some of the letter pairings.
- **Chosen-plaintext attack:** the intruder is able to choose the plaintext message and obtain its corresponding ciphertext form. If Trudy could get Alice to send the message "The quick brown fox jumps over the lazy dog" (a sentence containing every letter), she could completely break the encryption scheme.

**Polyalphabetic encryption:** the idea is to use **multiple monoalphabetic ciphers**, with a specific monoalphabetic cipher used to encode a letter in a specific position in the plaintext message. The same letter, appearing in different positions in the plaintext message, might be encoded differently. Example: use two Caesar ciphers (k = 5 and k = 19) in a repeating pattern C1, C2, C2, C1, C2. The encryption key is the knowledge of the two Caesar keys and the pattern.

**Block ciphers**
- Modern symmetric key encryption is done with **stream ciphers** and **block ciphers**. Block ciphers are used in many secure Internet protocols, including PGP (for secure email), TLS (for securing TCP connections) and IPsec (for securing the network-layer transport).
- In a block cipher, the message to be encrypted is processed in **blocks of k bits**. For example, if k = 64, the message is broken into 64-bit blocks, and each block is encrypted independently. To encode a block, the cipher uses a **one-to-one mapping** to map the k-bit block of cleartext to a k-bit block of ciphertext.
- A full table mapping for k = 64 would have 2^64 entries, far too many to store or exchange. So block ciphers typically use **functions that simulate randomly permuted tables**. Example: break a 64-bit block into 8 chunks of 8 bits, process each chunk with an 8-bit-to-8-bit table (manageable size), reassemble the chunks, scramble (permute) the 64 bits, then repeat this for **n cycles** (rounds). The purpose of the rounds is to make each input bit affect most (if not all) of the final output bits. The key for this block cipher algorithm would be the eight permutation tables (assuming the scramble function is publicly known).
- **Popular block ciphers:** **DES (Data Encryption Standard)**, **3DES** and **AES (Advanced Encryption Standard)**. Each of these standards uses functions, rather than predetermined tables. Each of these algorithms also uses a string of bits for a key.
  - **DES** uses 64-bit blocks with a **56-bit key**; it's now considered insecure (it can be cracked by brute force in under a day).
  - **AES** uses 128-bit blocks and can operate with keys that are **128, 192 and 256 bits** long. NIST estimated that a machine that could crack 56-bit DES in 1 second would take approximately **149 trillion years** to crack a 128-bit AES key.

**Cipher-block chaining (CBC)**
- In computer networking applications, we typically need to encrypt long messages or long streams of data. If we apply a block cipher by simply chopping up the message into k-bit blocks and independently encrypting each block, a subtle but important problem occurs: **two or more of the cleartext blocks can be identical** (for example, "HTTP/1.1" in many messages), and for these identical blocks, the block cipher would produce the **same ciphertext**. An attacker could potentially guess the cleartext when they see identical ciphertext blocks, and might even be able to decrypt the entire message by identifying identical ciphertext blocks and using knowledge about the underlying protocol structure.
- To address this, we can mix some randomness into the ciphertext so that identical plaintext blocks produce different ciphertext blocks.
- **CBC:** the sender generates a random k-bit string, called the **Initialization Vector (IV)**, denoted c(0), and sends it to the receiver **in cleartext**. For the first block, the sender calculates m(1) XOR c(0), passes the result through the block-cipher algorithm to get the corresponding ciphertext block: c(1) = K_S(m(1) XOR c(0)). For the i-th block, the sender generates the i-th ciphertext block from **c(i) = K_S(m(i) XOR c(i − 1))**: each plaintext block is XOR-ed with the **previous ciphertext block** before encryption. The receiver can recover the original message: m(i) = K_S(c(i)) XOR c(i − 1).
- Even if two cleartext blocks are identical, the corresponding ciphertexts (almost always) will be different. And the sender only needs to send the IV (one extra block), rather than a random string for every block.

### Public key encryption
- For more than 2,000 years, encrypted communication required that the two communicating parties **share a common secret**: the symmetric key used for encryption and decryption. One difficulty with this approach is that the two parties must somehow **agree on the shared key**, but to do so requires (presumably secure) communication! Perhaps the parties could first meet and agree on the key in person and thereafter communicate with encryption. But in a networked world, communicating parties may never meet and may never converse except over the network.
- **Diffie-Hellman** (1976) showed it was possible to communicate securely without sharing a known secret key in advance. This led to the development of today's public key cryptography systems.
- **How public key encryption works:**
  - Bob has two keys: a **public key** that is available to **everyone in the world** (including Trudy), and a **private key** that **only Bob knows**. We use **K_B+** for Bob's public key and **K_B−** for his private key.
  - To communicate with Bob, Alice first fetches Bob's public key. Alice then encrypts her message m to Bob using Bob's public key and a known (standardized) encryption algorithm: **K_B+(m)**.
  - Bob receives Alice's encrypted message and uses his private key and a known decryption algorithm to decrypt it: **K_B−(K_B+(m)) = m**.
  - Alice can thus send a secret message to Bob without either of them having to distribute any secret keys!
- **Requirements:** the public and private keys must be chosen so that it's **computationally infeasible** (impossible in practice) for an intruder to determine the private key from the public key, and **K_B−(K_B+(m)) = m**.
- **Concerns:** because Bob's encryption key is public, anyone (including Trudy) can send an encrypted message to Bob claiming to be Alice. In the case of a single shared secret key, the fact that the sender knows the secret key implicitly identifies the sender to the receiver. In the case of public key encryption, however, this is no longer the case, since anyone can send an encrypted message to Bob using Bob's publicly available key. A **digital signature** (Section 8.3) is needed to bind a sender to a message.

**RSA** (named after Ron Rivest, Adi Shamir and Leonard Adleman) has become almost synonymous with public key cryptography.
- RSA makes extensive use of arithmetic operations using **modulo-n arithmetic**. Key fact: **[(a mod n)^d] mod n = a^d mod n**.
- **Choosing the keys:**
  1. Choose two **large prime numbers, p and q**. The larger the values, the more difficult it is to break RSA, but the longer it takes to perform the encoding and decoding. RSA Laboratories recommends that the product of p and q be on the order of **1,024 bits** (or more; 2,048 bits today).
  2. Compute **n = pq** and **z = (p − 1)(q − 1)**.
  3. Choose a number **e**, less than n, that has **no common factors** (other than 1) with z. (In this case, e and z are said to be **relatively prime**.) The letter e is used since this value will be used in encryption.
  4. Find a number **d**, such that **ed − 1 is exactly divisible by z** (that is, with no remainder). The letter d is used because this value will be used in decryption. Put another way, given e, we choose d such that **ed mod z = 1**.
  5. The **public key** that Bob makes available to the world, K_B+, is the pair of numbers **(n, e)**; his **private key**, K_B−, is the pair of numbers **(n, d)**.
- **Encryption:** Alice wants to send Bob a bit pattern represented by the integer number m (with m < n). To encode, Alice performs the exponentiation m^e, and then computes the integer remainder when m^e is divided by n: **c = m^e mod n**. The resulting value c is the ciphertext.
- **Decryption:** Bob computes **m = c^d mod n**, which requires the use of his private key (n, d).
- **Toy example:** p = 5 and q = 7, so n = 35 and z = 24. Bob chooses e = 5, since 5 and 24 have no common factors. Finally, Bob chooses d = 29, since 5 × 29 − 1 (that is, ed − 1) is exactly divisible by 24. Bob makes the two values, n = 35 and e = 5, public and keeps the value d = 29 secret. To encrypt the letter "l" (represented as 12): 12^5 = 248832, and 248832 mod 35 = **17** (the ciphertext). To decrypt: 17^29 mod 35 = 12.
- **Why does RSA work?** By number theory: **(m^e mod n)^d mod n = m**. It also works the other way: **K_B−(K_B+(m)) = m = K_B+(K_B−(m))**: applying the public key first, then the private key, gives the original message, and so does applying the private key first, then the public key. This property is key to digital signatures.
- **Why is RSA secure?** It relies on the fact that there are **no known algorithms for quickly factoring a number**, in this case the public value n, into the primes p and q. If one knew p and q, then given the public value e, one could easily compute the secret key d.
- **Session keys:** the exponentiation required by RSA is a rather time-consuming process. DES is at least 100 times faster in software and between 1,000 and 10,000 times faster in hardware. As a result, RSA is often used in practice in combination with symmetric key cryptography: Alice first chooses a key that will be used to encode the data itself; this key is referred to as a **session key**, K_S. Alice must inform Bob of the session key, since this is the shared symmetric key they will use with a symmetric key cipher (like DES or AES). Alice encrypts the session key using Bob's public key: c = (K_S)^e mod n. Bob receives the RSA-encrypted session key, c, and decrypts it to obtain the session key, K_S. Bob now knows the session key that Alice will use for her encrypted data transfer.

## 8.3 Message Integrity and Digital Signatures

**Message integrity** (also known as **message authentication**): Bob receives a message (which may be encrypted or in plaintext) and believes it was sent by Alice. To authenticate this message, Bob needs to verify:
1. The message indeed **originated from Alice**.
2. The message was **not tampered with** on its way to Bob.

### Cryptographic hash functions
- A hash function takes an input, m, and computes a fixed-size string **H(m)** known as a **hash**. The Internet checksum and CRCs meet this definition.
- A **cryptographic hash function** is also required to have the following additional property: **it is computationally infeasible to find any two different messages x and y such that H(x) = H(y)**. Informally, this means it's computationally infeasible for an intruder to substitute one message for another message that is protected by the hash function.
- **Why the Internet checksum is a poor cryptographic hash:** it's easy to find another message with the same checksum. For example, the ASCII messages "IOU100.99BOB" and "IOU900.19BOB" have the **same checksum**, so Trudy could change an IOU from $100.99 to $900.19 without the checksum noticing.
- **MD5** (by Ron Rivest) computes a **128-bit hash**. It's been widely used, but researchers have found ways to produce collisions, so it's **no longer considered secure**.
- **SHA-1 (Secure Hash Algorithm)** produces a **160-bit** message digest. SHA-1 has also been shown to be vulnerable. Today, **SHA-2** and **SHA-3** families (e.g., SHA-256) are recommended.

### Message authentication code (MAC)
- Using only a hash, Trudy could create a bogus message m′, compute H(m′) and send (m′, H(m′)) to Bob, who would accept it. To perform message integrity, in addition to using cryptographic hash functions, Alice and Bob need a **shared secret s**. This shared secret, which is nothing more than a string of bits, is called the **authentication key**.
- **How it works:**
  1. Alice creates message m, concatenates s with m to create m + s, and calculates the hash **H(m + s)**. H(m + s) is called the **message authentication code (MAC)**.
  2. Alice then appends the MAC to the message m, creating an extended message **(m, H(m + s))**, and sends it to Bob.
  3. Bob receives an extended message (m, h) and, knowing s, calculates the MAC H(m + s). If **H(m + s) = h**, Bob concludes that everything is fine.
- A nice feature of a MAC is that it **doesn't require an encryption algorithm**. Indeed, in many applications, including the link-state routing algorithm, communicating entities are only concerned with message integrity and are not concerned with message confidentiality.
- Today, the most popular standard for MACs is **HMAC**, which can be used with either MD5 or SHA-1 (or SHA-2). HMAC actually runs data and the authentication key through the hash function twice.
- **Distributing the shared authentication key:** done by physical means (a network administrator configures each router), or by encrypting it with the receiver's public key.
- **Note on terminology:** "MAC" here (message authentication code) is different from "MAC" in the link layer (medium access control)!

### Digital signatures
- A **digital signature** is a cryptographic technique for achieving the goals of a handwritten signature in a digital world. Like handwritten signatures, it should be **verifiable** and **nonforgeable**: it must be possible to prove that a document signed by an individual was indeed signed by that individual (the signature is verifiable) and that **only that individual could have signed the document** (the signature can't be forged).
- **How to sign with public key cryptography:** Bob has his public and private keys, K_B+ and K_B−, both unique to Bob. To sign a document, m, Bob simply uses his **private key** to compute **K_B−(m)**.
  - Why is that a signature? Bob's private key is known only to Bob, so only Bob could have produced it.
  - **Verification:** Alice has the document m and the signature K_B−(m). She takes Bob's **public key**, K_B+, and applies it to the digital signature: **K_B+(K_B−(m)) = m**. If the result matches the original document, Alice can be sure that Bob signed it, because only Bob's private key could produce a signature that decrypts correctly with his public key. And if anyone modified the document after signing, the signature wouldn't match the modified document.
- **Efficiency: signing the hash.** Encryption and decryption are computationally expensive. Signing data via complete encryption/decryption is overkill. A more efficient approach is to introduce hash functions into the digital signature. Bob signs the **hash of the message, H(m)**, rather than the whole message: K_B−(H(m)). Since H(m) is generally much smaller than the original message m, the computational effort required to create the digital signature is substantially reduced.
  - **Sending:** Bob puts his original long message through a hash function. He then digitally signs the resulting hash with his private key. The original message (in cleartext) along with the digitally signed message digest (henceforth referred to as the digital signature) is then sent to Alice.
  - **Receiving:** Alice applies the sender's public key to the message to obtain a hash result. She also applies the hash function to the cleartext message to obtain a second hash result. If the two hashes match, then Alice can be sure about the **integrity** and **author** of the message.
- **Digital signature vs. MAC:** both start with a message (or document). To create a MAC, we append an authentication key to the message, and then take the hash of the result. Note that neither public key nor symmetric key encryption is involved in creating the MAC. To create a digital signature, we first take the hash of the message and then encrypt the message with our private key (using public key cryptography). Thus, a **digital signature is a "heavier" technique**, since it requires an underlying **Public Key Infrastructure (PKI)** with certification authorities. PGP (secure email) uses digital signatures; OSPF uses MACs; TLS and IPsec use MACs.

### Public key certification
- An important application of digital signatures is **public key certification**: certifying that a public key belongs to a specific entity. Public key certification is used in many popular secure networking protocols, including IPsec and TLS.
- **The problem:** Alice wants Bob's public key. How does she know the key she received truly belongs to Bob, and not to Trudy pretending to be Bob? **Pizza prank example:** Trudy sends Bob's pizza store an order "signed" with Trudy's private key, while claiming to be Bob and including her own public key, claiming it's Bob's. The store verifies the signature with the key Trudy provided, and Bob gets pizzas he never ordered. For public key cryptography to be useful, you need to be able to **verify that you have the actual public key** of the entity (person, router, browser, etc.) with whom you want to communicate.
- **Certification Authority (CA):** binding a public key to a particular entity is typically done by a CA, whose job is to validate identities and issue certificates. A CA has the following roles:
  1. A CA **verifies that an entity** (a person, a router, etc.) **is who it says it is**. There are no mandated procedures for how certification is done. When dealing with a CA, one must trust the CA to have performed a suitably rigorous identity verification.
  2. Once the CA verifies the identity of the entity, the CA creates a **certificate** that **binds the public key of the entity to the identity**. The certificate contains the public key and globally unique identifying information about the owner of the public key (for example, a human name or an IP address). The certificate is **digitally signed by the CA**.
- **Verification:** when Alice receives Bob's certificate (for example, from a web server), she uses the **CA's public key** to check the authenticity of Bob's certificate and extract Bob's public key. The CA's public key is typically known widely, often built into the browser or operating system.
- Both the **ITU** and the **IETF** have developed standards for CAs. **ITU X.509** specifies an authentication service as well as a specific syntax for certificates. Important certificate fields: version, serial number, signature algorithm, **issuer name**, validity period, **subject name**, and **subject public key**.

## 8.4 End-Point Authentication

**End-point authentication** is the process of one entity proving its identity to another entity over a computer network (for example, a user proving their identity to an email server). Authentication must be done solely on the basis of messages and data exchanged as part of an **authentication protocol**. Typically, an authentication protocol would run before the two communicating parties run some other protocol (for example, a reliable data transfer protocol, a routing information exchange protocol or an email protocol).

The book builds a protocol step by step, called **ap (authentication protocol)**, showing why each simpler version fails:
- **ap1.0:** Alice simply sends a message to Bob saying she is Alice. **Failure:** Trudy can send the same message, claiming to be Alice. Bob has no way of knowing who actually sent it.
- **ap2.0:** if Alice has a well-known network address (for example, an IP address) from which she always communicates, Bob could attempt to authenticate Alice by verifying that the source address on the IP datagram carrying the authentication message matches Alice's well-known address. **Failure:** **IP spoofing**: Trudy can create an IP datagram with any source IP address she wants (for example, Alice's) using raw sockets.
- **ap3.0:** one classic approach is to use a **secret password**. Alice sends her secret password to Bob. **Failure:** Trudy can **eavesdrop** on Alice's communication and obtain her password (for example, via packet sniffing). This is called a **playback attack** (Trudy plays back the recorded authentication message).
- **ap3.1:** encrypt the password, using a shared symmetric key. **Failure:** Trudy doesn't need to know the password to perform a **playback (replay) attack**: she just records the encrypted password and plays it back to Bob, pretending to be Alice.
- **ap4.0: nonce.** The failure scenario in ap3.1 resulted from the fact that Bob could not distinguish between the original authentication of Alice and the later playback of this original authentication. That is, Bob could not tell whether Alice was **live** (that is, was currently really on the other end of the connection) or whether the messages he was receiving were a recorded playback of a previous authentication of Alice. A **nonce** is a number that a protocol will use **only once in a lifetime**. ap4.0 uses a nonce as follows:
  1. Alice sends the message "I am Alice" to Bob.
  2. Bob chooses a nonce, R, and sends it to Alice.
  3. Alice encrypts the nonce using Alice and Bob's symmetric secret key, K_A-B, and sends the encrypted nonce, K_A-B(R), back to Bob. As in protocol ap3.1, it's the fact that Alice knows K_A-B and uses it to encrypt a value that lets Bob know that the message he receives was generated by Alice. The nonce is used to ensure that **Alice is live**.
  4. Bob decrypts the received message. If the decrypted nonce equals the nonce he asked Alice to encrypt, then Alice is authenticated.
- A public key version is also possible (Alice signs the nonce with her private key), but it's vulnerable to a **man-in-the-middle attack** if Bob can't verify that the public key really belongs to Alice, which is why certificates are needed.

## 8.5 Securing E-Mail

Security can be provided at any layer. The book looks at security at the application layer (email), transport layer (TLS), network layer (IPsec) and link layer (WiFi, 4G/5G).

### Secure email design
Alice wants to send an email message m to Bob. What security features are desired?
- **Confidentiality:**
  - The most straightforward way for Alice to provide confidentiality is to encrypt the message with symmetric key technology (like AES) and for Bob to decrypt it. But then the symmetric key must be distributed.
  - Public key cryptography (like RSA) could be used: Alice encrypts the message with Bob's public key. But public key encryption is relatively inefficient, particularly for long messages.
  - **Solution: use a session key.** Alice (i) selects a **random symmetric session key, K_S**, (ii) encrypts her message, m, with the symmetric key, (iii) encrypts the symmetric key with **Bob's public key, K_B+**, (iv) concatenates the encrypted message and the encrypted symmetric key to form a "package," and (v) sends the package to Bob's email address. Bob (i) uses his private key, K_B−, to obtain the symmetric key, K_S, and (ii) uses the symmetric key K_S to decrypt the message m.
- **Sender authentication and message integrity:**
  - Alice applies a hash function, H (for example, SHA-2), to her message, m, to obtain a message digest. She signs the result of the hash function with her **private key**, K_A−, to create a digital signature. She concatenates the original (unencrypted) message with the signature to create a package. She sends the package to Bob's email address.
  - When Bob receives the package, he applies Alice's public key, K_A+, to the signed message digest and compares the result of this operation with his own hash, H, of the message. If the results are the same, Bob can be pretty confident that the message came from Alice and is unaltered.
- **All three combined (confidentiality, sender authentication and message integrity):** Alice first creates a preliminary package, exactly as above (the message plus a digital signature of its hash). She then treats this preliminary package as a message in itself and sends it through the confidentiality steps above (session key + Bob's public key). So Alice uses public key cryptography twice: once with her own private key and once with Bob's public key. Similarly, Bob also uses public key cryptography twice: once with his private key and once with Alice's public key.
- **Getting public keys:** this design assumes Alice has Bob's public key and Bob has Alice's. A popular approach for distributing public keys is to **certify** them using a CA.

### PGP (Pretty Good Privacy)
- **PGP**, written by Phil Zimmermann in 1991, is a nice example of an email encryption scheme. The PGP design is essentially the same as the design above.
- Depending on the version, PGP uses MD5 or SHA for calculating the message digest; CAST, triple-DES or IDEA for symmetric key encryption; and RSA for public key encryption.
- When PGP is installed, the software creates a public key pair for the user. The public key can be posted on the user's website or placed in a public key server. The private key is protected by the use of a password. The password has to be entered every time the user accesses the private key.
- PGP gives the user the option of digitally signing the message, encrypting the message, or both digitally signing and encrypting.
- PGP also provides a mechanism for public key certification, but the mechanism is quite different from the more conventional CA. PGP public keys are certified by a **web of trust**: Alice herself can certify any key/username pair when she believes the pair really belong together. In addition, PGP permits Alice to say that she trusts another user to vouch for the authenticity of more keys. Some PGP users sign each other's keys by holding **key-signing parties**.

## 8.6 Securing TCP Connections: TLS

- **TLS (Transport Layer Security)** is a **hardened version of TCP** that provides confidentiality, data integrity and end-point authentication. TLS is a modified version of **SSL (Secure Sockets Layer) version 3**, originally designed by Netscape.
- TLS is **supported by all popular web browsers and web servers**, and it's used by Gmail and essentially all Internet commerce sites (including Amazon, eBay and TaoBao). Hundreds of billions of dollars are spent over TLS every year. In fact, if you've ever purchased anything over the Internet with your credit card, the communication between your browser and the server almost certainly went over TLS. (You can identify that TLS is being used by your browser when the URL begins with **https:** rather than http.)
- **Why TLS is needed (e-commerce example):** Bob is surfing the Web and arrives at the Alice Incorporated site, which is selling perfume. Bob enters his credit card number on a form and clicks a "submit" button. Without encryption:
  - an intruder could intercept Bob's order and obtain his payment card information (**confidentiality**);
  - an intruder could alter Bob's order, having him purchase much larger quantities than desired (**data integrity**);
  - a fake website could pose as Alice Incorporated, take Bob's money and run (**server authentication**).
- TLS addresses these issues by enhancing TCP with confidentiality, data integrity, server authentication and client authentication (although client authentication is typically handled by the application, using passwords).
- **Where is TLS?** TLS is often used to provide security to transactions that take place over HTTP. However, because TLS secures TCP, it can be employed by **any application that runs over TCP**. TLS provides a simple Application Programmer Interface (API) with sockets, similar and analogous to TCP's API. When an application wants to employ TLS, the application includes TLS classes/libraries. Although TLS technically resides in the **application layer**, from the developer's perspective it's a transport protocol that provides TCP's services enhanced with security services.

### The big picture: "almost-TLS"
The book first presents a simplified version of TLS with three phases: **handshake**, **key derivation** and **data transfer**.
- **Handshake:**
  1. Bob (the client) first establishes a **TCP connection** with Alice (the server).
  2. Bob verifies that Alice is really Alice: Bob sends Alice a hello message. Alice responds with her **certificate**, which contains her public key. Since the certificate has been certified by a CA, Bob knows for sure that the public key in the certificate belongs to Alice.
  3. Bob sends Alice a **master secret key (MS)**, which will be used by both Alice and Bob to generate all the symmetric keys they need for the TLS session. Bob generates a random **Pre-Master Secret (PMS)**, encrypts it with Alice's public key and sends it to Alice. Alice decrypts it with her private key. Both Alice and Bob then use the PMS (and nonces) to compute the **master secret**. Now both know the MS.
- **Key derivation:** in principle, the MS, now shared by Bob and Alice, could be used as the symmetric session key for all subsequent encryption and data integrity checking. It's, however, generally considered safer for Alice and Bob to each use **different cryptographic keys**, and also to use different keys for encryption and integrity checking. Thus, both Alice and Bob use the MS to generate **four keys**:
  - **E_B:** session encryption key for data sent from Bob to Alice;
  - **M_B:** session HMAC key for data sent from Bob to Alice, where HMAC is a standardized hashed message authentication code;
  - **E_A:** session encryption key for data sent from Alice to Bob;
  - **M_A:** session HMAC key for data sent from Alice to Bob.
- **Data transfer:**
  - Now that Alice and Bob share the same four session keys, they can start to send secured data to each other over the TCP connection. Since TCP is a byte-stream protocol, a natural approach would be for TLS to encrypt application data on the fly and then pass the encrypted data on the fly to TCP. But if we were to do this, where would we put the HMAC for the integrity check? We certainly don't want to wait until the end of the TCP session to verify the integrity of all of Bob's data that was sent over the entire session!
  - **TLS records:** to address this issue, TLS **breaks the data stream into records**, appends an **HMAC** to each record for integrity checking, and then **encrypts the record + HMAC**. To create the HMAC, Bob inputs the record data along with the key M_B into a hash function. To encrypt the package record + HMAC, Bob uses his session encryption key E_B. This encrypted package is then passed to TCP for transport over the Internet.
  - **Sequence numbers:** although this approach goes a long way, it still isn't bullet-proof when it comes to providing data integrity for the entire message stream. In particular, suppose Trudy is a woman-in-the-middle and has the ability to insert, delete and replace segments in the stream of TCP segments sent between Alice and Bob. Trudy, for example, could capture two segments sent by Bob, **reverse the order** of the segments, adjust the TCP sequence numbers (which aren't encrypted) and then send the two reverse-ordered segments to Alice. The solution is to use **sequence numbers**: Bob maintains a sequence number counter, which begins at zero and is incremented for each TLS record he sends. Bob doesn't actually include a sequence number in the record itself, but when he calculates the HMAC, he **includes the sequence number in the HMAC calculation**. Thus, the HMAC is now a hash of the data plus the HMAC key M_B plus the current sequence number. Alice tracks Bob's sequence numbers, allowing her to verify the data integrity of a record by including the appropriate sequence number in the HMAC calculation. This use of TLS sequence numbers prevents Trudy from carrying out a woman-in-the-middle attack, such as reordering or replaying segments.
  - **TLS record format:** the record consists of a **type** field, **version** field, **length** field, **data** field and **HMAC** field. The first three fields aren't encrypted. The type field indicates whether the record is a handshake message or a message that contains application data. It's also used to close the TLS connection.

### A more complete picture
- **The TLS handshake:** TLS doesn't mandate that Alice and Bob use a specific symmetric key algorithm or a specific public-key algorithm. Instead, TLS allows Alice and Bob to agree on the cryptographic algorithms at the beginning of the TLS session, during the handshake phase. Additionally, during the handshake phase, Alice and Bob send **nonces** to each other, which are used in the creation of the session keys (E_B, M_B, E_A and M_A). The steps of the real TLS handshake:
  1. The client sends a list of cryptographic algorithms it supports, along with a client nonce.
  2. From the list, the server chooses a symmetric algorithm (for example, AES), a public key algorithm (for example, RSA with a specific key length) and an HMAC algorithm (MD5 or SHA-1) along with the HMAC keys. It sends back to the client its choices, as well as a certificate and a server nonce.
  3. The client verifies the certificate, extracts the server's public key, generates a Pre-Master Secret (PMS), encrypts the PMS with the server's public key and sends the encrypted PMS to the server.
  4. Using the same key derivation function (as specified by the TLS standard), the client and server independently compute the Master Secret (MS) from the PMS and nonces. The MS is then sliced up to generate the two encryption and two HMAC keys. Furthermore, when the chosen symmetric cipher employs CBC (such as 3DES or AES), then two Initialization Vectors (IVs), one for each side of the connection, are also obtained from the MS. Henceforth, all messages sent between client and server are encrypted and authenticated (with the HMAC).
  5. The client sends the HMAC of all the handshake messages.
  6. The server sends the HMAC of all the handshake messages.
  - **Why steps 5 and 6?** In step 1, the client typically offers a list of algorithms, some strong and some weak. This list of algorithms is sent in cleartext, since the encryption algorithms and keys haven't yet been agreed upon. Trudy, as a woman-in-the-middle, could delete the stronger algorithms from the list, forcing the client to select a weak algorithm. To prevent such a tampering attack, in step 5, the client sends the HMAC of the concatenation of all the handshake messages it sent and received. The server can compare this HMAC with the HMAC of the handshake messages it received and sent. If there is an inconsistency, the server can terminate the connection. Similarly, the server sends the HMAC of the handshake messages it has seen, allowing the client to check for inconsistencies.
  - **Why nonces?** Without them, Trudy could record all of a session (say, Bob's purchase of perfume), and later **replay** it to Alice, causing a duplicate order. With nonces, each session has different keys (since the nonces are different), so the replayed records would fail the integrity checks. This defends against the **connection replay attack**.
- **Connection closure:** at some point, either Bob or Alice will want to end the TLS session. One approach would be to let Bob end the TLS session by simply terminating the underlying TCP connection, that is, by having Bob send a TCP FIN segment to Alice. But such a naive design sets the stage for the **truncation attack**, whereby Trudy once again gets in the middle of an ongoing TLS session and ends the session early with a TCP FIN. If Trudy were to do this, Alice would think she received all of Bob's data when, actually, she only received a portion of it. The solution is to indicate in the **type field** whether the record serves to terminate the TLS session. (Although the TLS type is sent in the clear, it's authenticated at the receiver using the record's HMAC.) By including such a field, if Alice were to receive a TCP FIN before receiving a closure TLS record, she would know that something funny was going on.
- **TLS 1.3** (the latest version) simplifies the handshake, requires **forward secrecy** (using **Diffie-Hellman** key exchange so that even if a server's private key is later stolen, past sessions can't be decrypted), removes older, weaker algorithms (like RSA key transport, MD5 and SHA-1 for signatures) and reduces the handshake to **one round trip** (or even zero for resumed sessions).

## 8.7 Network-Layer Security: IPsec and Virtual Private Networks

- The IP security protocol, more commonly known as **IPsec**, provides security at the **network layer**. IPsec secures IP datagrams between any two network-layer entities, including hosts and routers. Many institutions (corporations, government branches, nonprofit organizations, etc.) use IPsec to create **virtual private networks (VPNs)** that run over the public Internet.

### IPsec and VPNs
- An institution that extends over multiple geographical regions often desires its own IP network, so that its hosts and servers can send data to each other in a secure and confidential manner. To achieve this goal, the institution could actually deploy a stand-alone physical network, including routers, links and a DNS infrastructure, completely separate from the public Internet. Such a disjoint network, dedicated to a particular institution, is called a **private network**. Not surprisingly, a private network can be very costly, as the institution needs to purchase, install and maintain its own physical network infrastructure.
- Instead, many institutions today create **VPNs over the existing public Internet**. With a VPN, the institution's inter-office traffic is sent over the public Internet rather than over a physically independent network. But to provide confidentiality, the inter-office traffic is **encrypted before it enters the public Internet**.
- **How it works:** a host in headquarters sends an IP datagram to a salesperson in a hotel. The gateway router in headquarters converts the vanilla IPv4 datagram into an **IPsec datagram** and then forwards this IPsec datagram into the Internet. This IPsec datagram actually has a traditional IPv4 header, so that the routers in the public Internet process the datagram as if it were an ordinary IPv4 datagram (to them, the datagram is a perfectly ordinary datagram). But the payload of the IPsec datagram includes an IPsec header, which is used for IPsec processing; furthermore, the payload of the IPsec datagram is encrypted. When the IPsec datagram arrives at the salesperson's laptop, the OS in the laptop decrypts the payload (and provides other security services, like verifying data integrity) and passes the unencrypted payload to the upper-layer protocol (for example, to TCP or UDP).

### The AH and ESP protocols
In the IPsec protocol suite, there are two principal protocols:
- **Authentication Header (AH) protocol:** provides **source authentication and data integrity** but **not confidentiality**.
- **Encapsulation Security Payload (ESP) protocol:** provides **source authentication, data integrity and confidentiality**. Because confidentiality is often critical for VPNs and other IPsec applications, the ESP protocol is much more widely used than the AH protocol. The book focuses on ESP.

### Security associations
- IPsec datagrams are sent between pairs of network entities, such as between two hosts, between two routers, or between a host and a router. Before sending IPsec datagrams from source entity to destination entity, the source and destination entities create a **network-layer logical connection**. This logical connection is called a **security association (SA)**. An SA is a **simplex** logical connection; that is, it's **unidirectional** from source to destination. If both entities want to send secure datagrams to each other, then **two SAs** (that is, two logical connections) need to be established, one in each direction.
- The state information an entity maintains for an SA includes:
  - a 32-bit identifier for the SA, called the **Security Parameter Index (SPI)**;
  - the origin interface of the SA and the destination interface of the SA;
  - the type of encryption to be used (for example, 3DES with CBC);
  - the encryption key;
  - the type of integrity check (for example, HMAC with MD5);
  - the authentication key.
- An IPsec entity (router or host) often maintains state information for many SAs. An IPsec entity stores the state information for all of its SAs in its **Security Association Database (SAD)**, which is a data structure in the entity's OS kernel.

### The IPsec datagram
IPsec has two different packet forms, one for the so-called **tunnel mode** and the other for the so-called **transport mode**. The **tunnel mode**, being more appropriate for VPNs, is more widely deployed than the transport mode. The book focuses on ESP in tunnel mode.
- **How the router constructs an IPsec datagram:** the router (R1) appends to the back of the original IPv4 datagram (which includes the original header fields!) an **"ESP trailer"** field. It encrypts the result using the algorithm and key specified by the SA. It appends to the front of this encrypted quantity a field called the **"ESP header"**; the resulting package is called the "enchilada." It creates an **authentication MAC** over the whole enchilada using the algorithm and key specified in the SA. It appends the MAC to the back of the enchilada, forming the **payload**. Finally, it creates a brand **new IP header** with all the classic IPv4 header fields (together normally 20 bytes long), which it appends before the payload.
- The resulting IPsec datagram is a bona fide IPv4 datagram, with the traditional IPv4 header fields followed by a payload. But in this case, the payload contains an ESP header, the original IP datagram, an ESP trailer and an ESP authentication field (with the original datagram and ESP trailer encrypted). The original IP datagram has 172.16.1.17 for the source IP address and 172.16.2.48 for the destination IP address. Because the IPsec datagram includes the original IP datagram, these addresses are included (and encrypted) as part of the payload of the IPsec packet. But what about the source and destination IP addresses in the new IP header, that is, in the left-most header of the IPsec datagram? These addresses are set to the source and destination router interfaces at the two ends of the tunnels, namely, 200.168.1.100 and 193.68.2.23. Also, the protocol number in this new IPv4 header field is not set to that of TCP, UDP or SMTP, but instead to **50**, designating that this is an IPsec datagram using the ESP protocol.
- **ESP trailer** consists of three fields: **padding** (for block ciphers), **pad length** (so the receiving entity knows how much padding was inserted and thus needs to be removed), and **next header** (which identifies the type, for example, UDP, of data contained in the payload-data field).
- **ESP header** consists of the **SPI** (which indicates to the receiving entity the SA to which the datagram belongs; the receiving entity can then index its SAD with the SPI to determine the appropriate authentication/decryption algorithms and keys) and the **sequence number** (which is used to defend against **replay attacks**).
- **SPD (Security Policy Database):** an IPsec entity also maintains a database that indicates **what types of datagrams** (as a function of source IP address, destination IP address and protocol type) **are to be IPsec processed**, and for those that are to be IPsec processed, **which SA should be used**. The information in the SPD indicates "what" to do with an arriving datagram; the information in the SAD indicates "how" to do it.

### IKE: key management in IPsec
- When a VPN has a small number of end points (for example, just two routers), the network administrator can **manually type** the SA information (encryption/authentication algorithms and keys, and the SPIs) into the SADs of the endpoints. Such "manual keying" is clearly impractical for a large VPN, which may consist of hundreds or even thousands of IPsec routers and hosts. Large, geographically distributed deployments require an automated mechanism for creating the SAs. IPsec does this with the **Internet Key Exchange (IKE) protocol**.
- IKE has some similarities with the handshake in TLS. Each IPsec entity has a **certificate**, which includes the entity's public key. As with TLS, the IKE protocol has the two entities exchange certificates, negotiate authentication and encryption algorithms, and securely exchange key material for creating session keys in the IPsec SAs.
- IKE uses **two phases**:
  - **Phase 1:** the two sides use **Diffie-Hellman** to create a bi-directional **IKE SA** between the routers. During this exchange, each side reveals its identity to the other by signing their messages. However, the identities aren't revealed to a passive sniffer, since the messages are sent over the secured IKE SA channel. Also during phase 1, the two sides negotiate the IPsec encryption and authentication algorithms to be employed by the IPsec SAs.
  - **Phase 2:** both sides create an SA in each direction. At the end of phase 2, the encryption and authentication session keys are established on both sides for the two SAs. The two sides can then use the SAs to send secured datagrams.
- The reason for having two phases in IKE is computational cost: since the second phase doesn't involve any public-key cryptography, IKE can generate a large number of SAs between the two IPsec entities with relatively little computational cost.

## 8.8 Securing Wireless LANs and 4G/5G Cellular Networks

Security is a particularly important concern in wireless networks, where the radio waves carrying frames can propagate far beyond the building containing the wireless base station and hosts.

### Authentication and key agreement in 802.11 wireless LANs
Two critical (and intertwined) security concerns when a mobile device associates with an AP:
- **Mutual authentication:** before a mobile device is allowed to fully attach to an AP and send datagrams to remote hosts, the network typically will want to first authenticate the device: to verify the identity of the mobile device attaching to the network, and to check that device's access privileges. Similarly, the mobile device will want to authenticate the network it is joining, to make sure that the network it's joining is truly the network to which it wants to attach.
- **Encryption:** since 802.11 frames will be exchanged over a wireless channel that can be sniffed and manipulated by potential intruders, it will be important to encrypt link-level frames carrying user-level data (and control frames) exchanged between the mobile device and the AP.

**History:** the original 802.11 security standard, **WEP (Wired Equivalent Privacy)**, had serious flaws (weak, poorly designed encryption that could be broken within minutes). **WPA (WiFi Protected Access)** fixed some of these as a stopgap, and **WPA2** (based on 802.11i) became the standard. **WPA3** was released in 2018.

**The four phases of 802.11 security (WPA2/WPA3):**
- **Discovery:** the AP advertises its presence and the forms of authentication and encryption that can be provided to the mobile device. The mobile device then requests the specific forms of authentication and encryption that it desires. Although the device and AP are already exchanging messages, the device hasn't yet been authenticated nor does it have an encryption key, and so several more steps will be required before the device can communicate with an arbitrary remote host over the wireless channel.
- **Mutual authentication and shared symmetric key derivation:** this is the most critical step in "securing" the 802.11 channel. This step is greatly facilitated by assuming (which is true in practice in both enterprise and home networks) that the **authentication server** and the mobile device already have a **shared common secret** before starting mutual authentication. In this step, the device and the authentication server will use this shared secret along with nonces (to prevent relay attacks) and cryptographic hashing (to ensure message integrity) in authenticating each other. They will also derive the shared session key to be used by the mobile device and the AP to encrypt frames transmitted over the 802.11 wireless link.
- **Shared symmetric session key distribution:** since the encryption key is derived at the mobile device and the authentication server, a protocol will be needed for the authentication server to inform the AP of the shared symmetric session key. While this is rather straightforward, it is still an important step.
- **Encrypted communication between mobile device and a remote host via the AP:** this communication happens as we saw earlier in Section 7.3.2, with the link-layer frames sent between the mobile device and the AP being encrypted using the shared session key created and distributed by the earlier steps. **AES** symmetric key cryptography is typically used in practice for encrypting/decrypting frame data.

**The WPA four-way handshake (key derivation):**
- The mobile device (M) and the authentication server (AS) share an initial secret key, K_AS-M (also called the **PMK, Pairwise Master Key**).
  1. The AS generates a nonce, **NonceAS**, and sends it to the mobile device. (Nonces are used to avoid playback attacks and prove "liveness.")
  2. The mobile device receives NonceAS from the AS and generates its own nonce, **NonceM**. The mobile device then generates the symmetric shared session key, **K_M-AP**, using NonceAS, NonceM, the initial shared secret key K_AS-M, its MAC address and the MAC address of the AS. It then sends its nonce, NonceM, and an HMAC-signed (using the initial shared key) value that encodes NonceAS and the original shared secret.
  3. The AS receives this message from M. By looking at the HMAC-signed version of the nonce it had recently sent, the AS knows the mobile device is live; because the mobile device was able to encrypt using the shared secret key K_AS-M, the AS also knows that the mobile device is indeed who it claims to be (that is, a device that shares the initial secret key). The AS has now authenticated the mobile device! The AS can now also perform the exact same computation as the mobile device to derive the shared symmetric session key, K_M-AP, using the NonceM value it received, the nonce NonceAS it generated, the original shared symmetric secret key K_AS-M, and the MAC addresses of the mobile device and the AS. At this point, both the mobile device and the AS have computed the same shared symmetric key, K_M-AP, which will be used to encrypt/decrypt frames transmitted between the mobile device and the AP. The AS informs the AP of this key value.
- **802.11 security messaging protocols (EAP):** the **Extensible Authentication Protocol (EAP)** defines the end-to-end message formats used in a simple request/response mode of interaction between the mobile device and authentication server, which are certified under WPA2. EAP messages are encapsulated using **EAPoL (EAP over LAN)** and sent over the 802.11 wireless link. These EAP messages are then decapsulated at the access point, and then re-encapsulated using the **RADIUS** protocol for transmission over UDP/IP to the authentication server. While the RADIUS server and protocol are not required by the 802.11i protocol, they are de facto standard components for 802.11i. The recently standardized **DIAMETER** protocol is likely to replace RADIUS in the future.
- **In home networks:** the AP and authentication server are often in the same box, and the shared secret comes from the WiFi password.

### Authentication and key agreement in 4G/5G cellular networks
- Like in 802.11, mutual authentication and the generation of symmetric keys for encrypting the wireless link are needed. Unlike 802.11, in 4G/5G there is a separation between the network the mobile device is attached to (the visited network) and the network that holds the device's authentication information (the home network).
- **4G AKA (Authentication and Key Agreement) protocol:**
  - The mobile device's **SIM** card and the home network's **HSS** share a **secret key, K_HSS-M**, which is stored on the SIM card.
  - When the mobile device first attaches, it sends an **attach message** containing its **IMSI** (its identity) to the base station, which forwards it to the visited network's **MME**.
  - The MME forwards the IMSI and information about the visited network to the home network's **HSS**.
  - The HSS uses the shared secret key, K_HSS-M, to compute an **authentication token, auth_token** (which proves the message comes from the home network) and the **expected authentication response, xres_HSS** (the answer it expects the mobile device to compute). It also derives the keys that will be used to encrypt the wireless link. The HSS sends auth_token and xres_HSS to the MME, which keeps xres_HSS and forwards auth_token to the mobile device.
  - The mobile device receives auth_token. Because the token is computed with the shared secret key, the mobile device can verify that it was created by its home network: **the mobile device authenticates the network**.
  - The mobile device computes a response, **res_M**, using its secret key and the same cryptographic function the HSS used to compute xres_HSS, and sends it to the MME.
  - The MME compares the value computed by the mobile device (res_M) with the xres_HSS value computed by the HSS. If they match, **the network authenticates the mobile device**.
  - The MME tells the base station that mutual authentication has completed, and the base station and mobile device generate keys for encrypting their communication (with AES being one of the algorithms used).
- **5G improvements:**
  - **Authentication can be done by the home network**, without the visited network being a trusted intermediary, giving the home network more control (in 4G, the visited network's MME makes the authentication decision).
  - 5G also supports alternatives to AKA, including the **EAP**-based protocols used in WiFi.
  - **Protecting the IMSI:** in 4G, the IMSI is sent **in cleartext** from the mobile device to the base station, so it can be intercepted (by **IMSI catchers**, also called "Stingrays," fake base stations used to track people). In 5G, the IMSI is **encrypted with the home network's public key** before it's sent.

## 8.9 Operational Security: Firewalls and Intrusion Detection Systems

### Firewalls
- A **firewall** is a combination of hardware and software that **isolates an organization's internal network from the Internet at large**, allowing some packets to pass and blocking others. A firewall allows a network administrator to control access between the outside world and resources within the administered network by managing the traffic flow to and from these resources.
- **Three goals of a firewall:**
  - **All traffic from outside to inside, and vice versa, passes through the firewall.** (The firewall is the single access point.)
  - **Only authorized traffic, as defined by the local security policy, will be allowed to pass.**
  - **The firewall itself is immune to penetration.** The firewall itself is a device connected to the network. If not designed or installed properly, it can be compromised, in which case it provides only a false sense of security (which is worse than no firewall at all!).
- **Three categories of firewalls:**

**1. Traditional packet filters**
- An organization typically has a gateway router connecting its internal network to its ISP (and hence to the larger public Internet). All traffic leaving and entering the internal network passes through this router, and it's at this router where **packet filtering** occurs. A packet filter examines **each datagram in isolation**, determining whether the datagram should be allowed to pass or should be dropped based on administrator-specific rules.
- Filtering decisions are typically based on: **IP source or destination address**; **protocol type in the IP datagram field** (TCP, UDP, ICMP, OSPF, etc.); **TCP or UDP source and destination port**; **TCP flag bits** (SYN, ACK, etc.); **ICMP message type**; different rules for datagrams leaving and entering the network; different rules for the different router interfaces.
- **Example policies and their filter settings:**
  - **No outside web access:** drop all outgoing packets to any IP address, port 80.
  - **No incoming TCP connections, except those for the organization's public web server only:** drop all incoming TCP SYN packets to any IP except 130.207.244.203 (the public web server), port 80.
  - **Prevent web radios from eating up the available bandwidth:** drop all incoming UDP packets, except DNS.
  - **Prevent your network from being used for a smurf DoS attack:** drop all ICMP ping packets going to a "broadcast" address (for example, 130.207.255.255).
  - **Prevent your network from being tracerouted:** drop all outgoing ICMP TTL expired traffic.
- **Access control lists (ACLs):** a firewall policy is implemented in a router with an **access control list**, with each router interface having its own list. The rules in an ACL are applied **from top to bottom**: the first matching rule determines the action (allow or deny). A typical ACL ends with a default "deny all" rule.
- **Example:** to allow internal hosts to browse the Web but block other traffic: allow outgoing TCP from inside to any address, destination port 80, with any flags; allow incoming TCP from any address to inside, source port 80, with the **ACK** bit set (since only replies to connections initiated from inside should have the ACK bit set; the incoming SYN that would start a new connection doesn't); allow DNS traffic both ways on UDP port 53; deny everything else.

**2. Stateful packet filters**
- In a traditional packet filter, filtering decisions are made on **each packet in isolation**. Stateful filters actually **track TCP connections**, and use this knowledge to make filtering decisions.
- **Why?** In the example above, an attacker could send a packet with **ACK = 1** from source port 80 to any internal host, and it would pass the traditional filter even though no internal host ever opened a connection to it. Such packets can be used for attacks (like mapping the internal network).
- Stateful filters solve this by keeping a **connection table** of all ongoing TCP connections. The firewall can observe the beginning of a new connection by observing a **three-way handshake (SYN, SYNACK, and ACK)**; and it can observe the end of a connection when it sees a **FIN** packet for the connection. The firewall can also (conservatively) assume that the connection is over when it hasn't seen any activity over the connection for, say, 60 seconds.
- The access control list now includes a column "**check connection**," indicating whether the firewall should check the connection table for a matching connection before allowing the packet. An arriving packet with ACK = 1 from port 80 is only allowed through if it matches an entry in the connection table, that is, a connection initiated from inside.

**3. Application gateways**
- To have finer-level security, firewalls must combine packet filters with **application gateways**. Application gateways look beyond the IP/TCP/UDP headers and make policy decisions based on **application data**.
- An **application gateway** is an application-specific server through which **all application data (inbound and outbound) must pass**. Multiple application gateways can run on the same host, but each gateway is a separate server with its own processes.
- **Example (Telnet):** an organization wants to allow only a restricted set of internal users (as opposed to IP addresses) to Telnet outside. The packet filter is set to block all Telnet connections except those that originate from the IP address of the application gateway. The internal user must first Telnet to the application gateway, which prompts for a user ID and password. If the user is authorized, the gateway prompts for the external host, and sets up a Telnet session between itself and the external host, relaying data between the two connections.
- **Drawbacks:** a **different application gateway is needed for each application**; there is a **performance penalty**, since all data will be relayed via the gateway; and the **client software must know how to contact the gateway** when the user makes a request, and must know how to tell the application gateway what external server to connect to.

### Intrusion detection systems
- A packet filter (traditional and stateful) inspects IP, TCP, UDP and ICMP header fields when deciding which packets to let pass through the firewall. However, to detect many attack types, we need to perform **deep packet inspection**, that is, look beyond the header fields and into the actual application data that the packets carry.
- A device that generates **alerts when it observes potentially malicious traffic** is called an **intrusion detection system (IDS)**. A device that **filters out suspicious traffic** is called an **intrusion prevention system (IPS)**. The book uses "IDS" for both.
- **An IDS can be used to detect a wide range of attacks:** network mapping (originating, for example, from nmap), port scans, TCP stack scans, DoS bandwidth-flooding attacks, worms and viruses, OS vulnerability attacks and application vulnerability attacks.
- **Deployment:** an organization may deploy one or more IDS sensors in its network. When multiple sensors are deployed, they typically work in concert, sending information about suspicious traffic activity to a central IDS processor, which collects and integrates the information and sends alarms to network administrators when deemed appropriate. A common arrangement: the organization's network is divided into a **high-security region** (protected by a packet filter and an application gateway and monitored by IDS sensors) and a **lower-security region**, referred to as the **demilitarized zone (DMZ)**, which is protected only by the packet filter, but also monitored by IDS sensors. The DMZ includes the organization's servers that need to communicate with the outside world, such as its public web server and its authoritative DNS server.
- **Multiple sensors** are used because an IDS needs to do deep packet inspection and compare each passing packet with tens of thousands of "signatures"; this can require a significant amount of processing, particularly if the organization receives gigabits/sec of traffic from the Internet. By placing sensors further downstream, each sensor sees only a fraction of the organization's traffic, and can more easily keep up.
- **Two broad categories of IDS:**
  - **Signature-based systems** maintain an extensive database of **attack signatures**. Each signature is a set of rules pertaining to an intrusion activity. A signature may simply be a list of characteristics about a single packet (for example, source and destination port numbers, protocol type and a specific string of bits in the packet payload), or may relate to a series of packets. The signatures are normally created by skilled network security engineers who research known attacks. An organization's network administrator can customize the signatures or add its own to the database.
    - **Limitations:** they require **previous knowledge of the attack** to generate an accurate signature. In other words, a signature-based IDS is completely blind to new attacks that have yet to be recorded. Another disadvantage is that even if a signature is matched, it may not be the result of an attack, so a **false alarm** may be generated. Finally, because every packet must be compared with an extensive collection of signatures, the IDS can become overwhelmed with processing and actually fail to detect many malicious packets.
  - **Anomaly-based systems** create a **traffic profile** as it observes traffic in normal operation. It then looks for packet streams that are **statistically unusual**, for example, an inordinate percentage of ICMP packets or a sudden exponential growth in port scans and ping sweeps.
    - **Advantage:** they don't rely on previous knowledge about existing attacks; that is, they can potentially **detect new, undocumented attacks**.
    - **Disadvantage:** it's an extremely challenging problem to distinguish between normal traffic and statistically unusual traffic. To date, most IDS deployments are primarily signature-based, although some include some anomaly-based features.
- **Snort** is a public-domain, open source IDS with hundreds of thousands of existing deployments. It can run on Linux, UNIX and Windows platforms. It uses the generic sniffing interface libpcap, which is also used by Wireshark and many other packet sniffers. It can easily handle 100 Mbps of traffic; for installations with gigabit/sec traffic rates, multiple Snort sensors may be needed. Snort signatures are written by a large community of users (and the company that maintains it). When a new threat emerges, the Snort community writes and releases an attack signature within hours.

## Key terms
- **Confidentiality, message integrity, end-point authentication, operational security:** the four security goals.
- **Plaintext, ciphertext, key, encryption/decryption algorithm.**
- **Symmetric key vs. public key cryptography.**
- **Caesar, monoalphabetic and polyalphabetic ciphers.**
- **Ciphertext-only, known-plaintext and chosen-plaintext attacks.**
- **Block cipher; DES, 3DES, AES.**
- **CBC and IV:** XOR each block with the previous ciphertext block.
- **Diffie-Hellman:** key exchange without a pre-shared secret.
- **RSA:** n = pq, z = (p−1)(q−1), ed mod z = 1; c = m^e mod n, m = c^d mod n.
- **Session key:** a symmetric key exchanged using public key cryptography.
- **Cryptographic hash function; MD5, SHA-1, SHA-2/3.**
- **MAC (message authentication code); HMAC.**
- **Digital signature:** sign the hash with the private key; verify with the public key.
- **Certification authority (CA), certificate, X.509, PKI.**
- **Nonce, playback (replay) attack, man-in-the-middle attack.**
- **PGP, web of trust.**
- **TLS:** handshake, master secret, four session keys, records with HMACs and sequence numbers, truncation attack.
- **IPsec, VPN, AH, ESP, tunnel mode, security association (SA), SPI, SAD, SPD, IKE.**
- **WEP, WPA, WPA2, WPA3, EAP, EAPoL, RADIUS, PMK, four-way handshake.**
- **4G AKA, IMSI, SIM, HSS, MME; IMSI catchers.**
- **Firewall: packet filter, stateful filter, application gateway, ACL.**
- **IDS/IPS, deep packet inspection, DMZ, signature-based vs. anomaly-based, Snort.**

## Quick review
- Explain the four properties of secure communication.
- Compare symmetric and public key cryptography and why session keys are used.
- Encrypt and decrypt a small number by hand with RSA.
- Explain CBC and why it's needed.
- Compare a MAC and a digital signature, and explain why certificates are needed.
- Trace the ap1.0 → ap4.0 authentication protocols and the attack each one fails to.
- Walk through the TLS handshake and explain why nonces, sequence numbers and the final HMACs matter.
- Explain how IPsec ESP in tunnel mode builds a datagram for a VPN.
- Write ACL rules for a given firewall policy, and explain what stateful filtering adds.
- Compare signature-based and anomaly-based IDS.
