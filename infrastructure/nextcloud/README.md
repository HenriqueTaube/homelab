# Nextcloud

Self-hosted file sync and share, running on Ubuntu VM in Proxmox.

## Stack

| Component | Details |
|-----------|---------|
| VM | Proxmox VM 102 |
| OS | Ubuntu (LVM disk layout) |
| IP | 192.168.1.224 |
| Web server | Apache2 (HTTP :80 + HTTPS :443) |
| Database | MariaDB |
| PHP | 8.4 via mod_php (mpm_prefork) |

## Installation method

Manual install on Ubuntu (LAMP stack):

```bash
# 1. Install dependencies
sudo apt install apache2 mariadb-server php8.4 php8.4-gd php8.4-mysql \
  php8.4-curl php8.4-mbstring php8.4-intl php8.4-xml php8.4-zip \
  php8.4-bcmath php8.4-imagick libapache2-mod-php8.4

# 2. Download and extract Nextcloud
wget https://download.nextcloud.com/server/releases/latest.tar.bz2
sudo tar -xjf latest.tar.bz2 -C /var/www/

# 3. Set permissions
sudo chown -R www-data:www-data /var/www/nextcloud

# 4. Create MariaDB database
sudo mysql -u root -p
# CREATE DATABASE nextcloud;
# CREATE USER 'nextcloud'@'localhost' IDENTIFIED BY 'password';
# GRANT ALL PRIVILEGES ON nextcloud.* TO 'nextcloud'@'localhost';
# FLUSH PRIVILEGES;

# 5. Enable Apache modules and sites (see Apache modules section below)
# 6. Run the Nextcloud web installer at http://192.168.1.224
```

## Config files

| File | Location on VM | Purpose |
|------|---------------|---------|
| `config/nextcloud.conf` | `/etc/apache2/sites-available/nextcloud.conf` | Apache HTTP vhost |
| `config/nextcloud-ssl.conf` | `/etc/apache2/sites-available/nextcloud-ssl.conf` | Apache HTTPS vhost + security headers |
| `config/php.ini` | `/etc/php/*/apache2/php.ini` | PHP tuned for Nextcloud |

## Key PHP settings

```ini
memory_limit       = 1G
upload_max_filesize = 16G
post_max_size      = 16G
max_execution_time = 3600
max_input_time     = 3600
opcache.enable     = 1
```

## Background jobs (cron)

Nextcloud background jobs run via system cron every 5 minutes:

```bash
# sudo crontab -u www-data -e
*/5 * * * * php -f /var/www/nextcloud/cron.php
```

Verify cron mode is active in Nextcloud admin panel:
`Settings > Administration > Basic settings > Background jobs > Cron`

## Apache modules

Enable all required modules on a fresh install:

```bash
sudo a2enmod rewrite headers ssl env dir mime deflate setenvif socache_shmcb
sudo systemctl restart apache2
```

Enable the Nextcloud sites:

```bash
sudo a2ensite nextcloud.conf nextcloud-ssl.conf
sudo systemctl reload apache2
```

## SSL

Self-signed certificate stored at:
- `/etc/ssl/nextcloud/nextcloud.crt`
- `/etc/ssl/nextcloud/nextcloud.key`

## Known issues / Runbooks

- [Disk full — MariaDB crash and LVM resize](../../runbooks/nextcloud-disk-full.md)
