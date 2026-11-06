# Password protection for parts of this static site.
#
# GitHub Pages serves everything publicly, so protected content is encrypted at build time with
# AES-256-GCM. Each lock in `site_lock.locks` (_config.yml) has its own password, read from the
# environment variable named there, which never enters the repository. The key is derived with
# PBKDF2-SHA256; assets/js/site-lock.js derives the same key in the browser and decrypts.
#
#   pages with `protect: <lock>`         -> their content is replaced by an encrypted blob
#   site_lock.files: {<file>: <lock>}    -> written as <file>.enc, the plain file is removed from _site
#
# Without the variable a development build uses the password "dev"; a production build fails.
require "openssl"
require "base64"

module SiteLock
  ITERATIONS = 250_000

  def self.config(site)
    site.config["site_lock"]
  end

  def self.key(site, lock)
    @keys ||= {}
    @keys[lock] ||= begin
      env = config(site)["locks"][lock] or raise "SiteLock: unknown lock #{lock.inspect}"
      password = ENV[env].to_s
      if password.empty?
        raise "SiteLock: #{env} is not set" if Jekyll.env == "production"
        Jekyll.logger.warn "SiteLock:", "#{env} not set, the #{lock} lock uses the password \"dev\""
        password = "dev"
      end
      OpenSSL::KDF.pbkdf2_hmac(password, salt: "#{config(site)["salt"]}:#{lock}", iterations: ITERATIONS,
                                         length: 32, hash: "sha256")
    end
  end

  # iv (12 bytes) + ciphertext + tag (16 bytes): the layout WebCrypto's AES-GCM expects
  def self.encrypt(site, lock, data)
    cipher = OpenSSL::Cipher.new("aes-256-gcm").encrypt
    cipher.key = key(site, lock)
    iv = cipher.random_iv
    ciphertext = data.empty? ? "" : cipher.update(data)
    iv + ciphertext + cipher.final + cipher.auth_tag
  end
end

# Values the browser needs to check a password; available to templates as site.site_lock.*
Jekyll::Hooks.register :site, :pre_render do |site|
  next unless site.pages.any? { |page| page.data["protect"] } # no protected page: no password needed
  lock = SiteLock.config(site)
  lock["iterations"] = SiteLock::ITERATIONS
  lock["checks"] = lock["locks"].keys.to_h do |name|
    [name, Base64.strict_encode64(SiteLock.encrypt(site, name, "site-lock-ok"))]
  end
  lock["checks_json"] = lock["checks"].to_json
end

Jekyll::Hooks.register [:pages, :documents], :post_convert do |doc|
  lock = doc.data["protect"]
  next unless lock
  blob = Base64.strict_encode64(SiteLock.encrypt(doc.site, lock.to_s, doc.content.b))
  doc.content = %(<div class="site-lock" data-lock="#{lock}" data-site-lock="#{blob}"></div>)
end

Jekyll::Hooks.register :site, :post_write do |site|
  (SiteLock.config(site)["files"] || {}).each do |rel, lock|
    path = File.join(site.dest, rel)
    next unless File.exist?(path)
    File.binwrite("#{path}.enc", SiteLock.encrypt(site, lock, File.binread(path)))
    File.delete(path)
  end
end
