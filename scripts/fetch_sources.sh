#!/bin/sh
# Download the two EDRDG dictionaries that are not git repositories into sources/.
# KanjiVG and OpenJLPT are git submodules:  git submodule update --init
set -e
cd "$(dirname "$0")/../sources"

curl -fL -o kanjidic2.xml.gz http://www.edrdg.org/kanjidic/kanjidic2.xml.gz
curl -fL -o JMdict_e.gz http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
ls -lh kanjidic2.xml.gz JMdict_e.gz
