use std::io;
use acme_lib::DirectoryUrl;
use acme_lib::persist::FilePersist;
use acme_lib::create_p384_key;
use acme_lib::Certificate;

pub async fn obtain_certificate(domain: &str, email: &str) -> io::Result<(Vec<u8>, Vec<u8>)> {
    let persist = FilePersist::new("backend/acme_store");
    let dir = match acme_lib::Directory::from_url(persist, DirectoryUrl::LetsEncrypt).await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[letsencrypt] Failed to connect to Let's Encrypt: {}", e);
            return fallback_self_signed(domain);
        }
    };
    let acc = match dir.account(email).await {
        Ok(a) => a,
        Err(e) => {
            eprintln!("[letsencrypt] Failed to create ACME account: {}", e);
            return fallback_self_signed(domain);
        }
    };
    let mut ord = match acc.new_order(domain, &[]).await {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[letsencrypt] Failed to create order: {}", e);
            return fallback_self_signed(domain);
        }
    };
    let auths = ord.authorizations().await.map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    for auth in auths {
        let chall = auth.http_challenge().ok_or_else(|| io::Error::new(io::ErrorKind::Other, "No HTTP challenge"))?;
        // User must serve chall.token() -> chall.http_proof() at http://domain/.well-known/acme-challenge/
        println!("[letsencrypt] To verify, serve {} at /.well-known/acme-challenge/{}", chall.http_proof(), chall.token());
        // For automation, you must set up a temporary HTTP server to serve this file.
        // For now, wait for user to confirm.
        println!("[letsencrypt] Press Enter after challenge is set up...");
        let mut s = String::new();
        let _ = std::io::stdin().read_line(&mut s);
        chall.validate().await.map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    }
    let pkey = create_p384_key();
    let cert = ord.finalize_pkey(pkey, 5000).await.map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let cert_pem = cert.certificate().to_pem().map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let key_pem = cert.private_key().to_pem().map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    Ok((cert_pem, key_pem))
}

fn fallback_self_signed(domain: &str) -> io::Result<(Vec<u8>, Vec<u8>)> {
    use openssl::rsa::Rsa;
    use openssl::x509::{X509, X509NameBuilder};
    use openssl::pkey::PKey;
    use openssl::x509::X509Builder;
    use openssl::x509::extension::SubjectAlternativeName;
    use openssl::hash::MessageDigest;
    use openssl::asn1::Asn1Time;
    let rsa = Rsa::generate(4096).map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let pkey = PKey::from_rsa(rsa).map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    let mut name = X509NameBuilder::new().unwrap();
    name.append_entry_by_text("CN", domain).unwrap();
    let name = name.build();
    let mut builder = X509Builder::new().unwrap();
    builder.set_version(2).unwrap();
    builder.set_subject_name(&name).unwrap();
    builder.set_issuer_name(&name).unwrap();
    builder.set_pubkey(&pkey).unwrap();
    builder.set_not_before(&Asn1Time::days_from_now(0).unwrap()).unwrap();
    builder.set_not_after(&Asn1Time::days_from_now(365).unwrap()).unwrap();
    let mut san = SubjectAlternativeName::new();
    san.dns(domain);
    let san_ext = san.build(&builder.x509v3_context(None, None)).unwrap();
    builder.append_extension(san_ext).unwrap();
    builder.sign(&pkey, MessageDigest::sha256()).unwrap();
    let cert = builder.build();
    let cert_pem = cert.to_pem().unwrap();
    let key_pem = pkey.private_key_to_pem_pkcs8().unwrap();
    Ok((cert_pem, key_pem))
} 